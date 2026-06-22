import tls from "node:tls";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SocksClient } = require("socks") as typeof import("socks");

import type { BingMentionEntry } from "@/types/bing-search";

const BING_BASE = "https://www.bing.com/search";

/** デフォルトで巡回するページ数（1 ページ = 10 件想定） */
const BING_DEFAULT_MAX_PAGES = 5;
/** ページ間の最小／最大ディレイ ms（過度なアクセスを避けるため） */
const BING_DELAY_MIN_MS = 300;
const BING_DELAY_MAX_MS = 700;
/** 1 ページの取得に費やす最大時間 */
const BING_PAGE_TIMEOUT_MS = 12_000;

const BING_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ja;q=0.7,zh-CN;q=0.5",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Upgrade-Insecure-Requests": "1",
  Referer: "https://www.bing.com/",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelayMs(): number {
  return (
    BING_DELAY_MIN_MS +
    Math.floor(Math.random() * (BING_DELAY_MAX_MS - BING_DELAY_MIN_MS + 1))
  );
}

/** "@username" site:x.com OR site:twitter.com を組み立てる */
function buildBingQuery(screenName: string): string {
  const sn = screenName.replace(/^@+/, "").trim();
  return `"@${sn}" site:x.com OR site:twitter.com`;
}

function buildBingUrl(screenName: string, first: number): string {
  const q = buildBingQuery(screenName);
  const params = new URLSearchParams({
    q,
    // 過去 7 日に限定（Yahoo の 30 日と相補）
    freshness: "Week",
    // ページネーション。Bing は first=1,11,21,... で 10 件刻み
    first: String(first),
    // 検索フォーム由来の見せかけ
    form: "QBLH",
  });
  return `${BING_BASE}?${params.toString()}`;
}

/** SOCKS5 + TLS 経由で HTML テキストを取得（Yahoo 側と同じ前提）*/
async function fetchHtmlViaSocks5(
  urlStr: string,
  proxyHost: string,
  proxyPort: number,
): Promise<string> {
  const u = new URL(urlStr);
  const host = u.hostname;
  const port = parseInt(u.port || "443", 10);
  const pathAndQuery = u.pathname + u.search;

  const { socket: rawSocket } = await SocksClient.createConnection({
    proxy: { host: proxyHost, port: proxyPort, type: 5 },
    command: "connect",
    destination: { host, port },
  });

  const tlsSocket = tls.connect({ socket: rawSocket, servername: host });
  await new Promise<void>((res, rej) => {
    tlsSocket.once("secureConnect", res);
    tlsSocket.once("error", rej);
  });

  const headerLines = [
    `GET ${pathAndQuery} HTTP/1.1`,
    `Host: ${host}`,
    ...Object.entries(BING_HEADERS).map(([k, v]) => `${k}: ${v}`),
    "Connection: close",
    "",
    "",
  ].join("\r\n");

  tlsSocket.write(headerLines);

  const chunks: Buffer[] = [];
  await new Promise<void>((res) => {
    tlsSocket.on("data", (c: Buffer) => chunks.push(c));
    tlsSocket.on("end", res);
    tlsSocket.on("error", res);
  });
  tlsSocket.destroy();

  const raw = Buffer.concat(chunks).toString("utf8");
  const bodyStart = raw.indexOf("\r\n\r\n");
  if (bodyStart === -1) throw new Error("Invalid HTTP response from Bing");
  let body = raw.slice(bodyStart + 4);

  const statusLine = raw.split("\r\n")[0] ?? "";
  const statusCode = parseInt(statusLine.split(" ")[1] ?? "0", 10);
  if (statusCode !== 200) throw new Error(`Bing HTTP ${statusCode}`);

  if (
    raw.includes("Transfer-Encoding: chunked") ||
    raw.includes("transfer-encoding: chunked")
  ) {
    const lines = body.split("\r\n");
    let decoded = "";
    let i = 0;
    while (i < lines.length) {
      const sizeLine = lines[i++]?.trim();
      if (!sizeLine) continue;
      const size = parseInt(sizeLine, 16);
      if (!size) break;
      decoded += lines[i++] ?? "";
    }
    body = decoded || body;
  }

  return body;
}

async function fetchBingHtml(url: string): Promise<string> {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (proxyUrl && /^socks/i.test(proxyUrl)) {
    const u = new URL(proxyUrl);
    return fetchHtmlViaSocks5(url, u.hostname, parseInt(u.port, 10));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BING_PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: BING_HEADERS,
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Bing HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bing が ck/a リダイレクトに包んだ URL から実 URL を取り出すヘルパー。
 * 取れない場合は元の文字列を返す。
 */
function tryUnwrapBingRedirect(href: string): string {
  try {
    const u = new URL(href, BING_BASE);
    if (!/(^|\.)bing\.com$/i.test(u.hostname)) return href;
    const target = u.searchParams.get("u");
    if (!target) return href;
    // Bing の u= は "a1" + base64(URL) という形式が多い
    const stripped = target.replace(/^a1/, "");
    try {
      const decoded = Buffer.from(stripped, "base64").toString("utf8");
      if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch {
      /* fallthrough */
    }
    return target;
  } catch {
    return href;
  }
}

const TWEET_URL_RE =
  /https?:\/\/(?:mobile\.|m\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/gi;

/**
 * HTML 全文をスキャンし、X / Twitter のツイート URL を抽出して
 * BingMentionEntry に正規化する（同 tweetId は最初の出現を採用）。
 * - bing.com/ck/a の u= 経由 URL は復号して再スキャン
 */
export function parseBingHtmlForTweets(
  html: string,
  selfScreenName: string,
): BingMentionEntry[] {
  const self = selfScreenName.replace(/^@+/, "").toLowerCase();
  const seen = new Map<string, BingMentionEntry>();

  const scan = (text: string) => {
    TWEET_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TWEET_URL_RE.exec(text)) !== null) {
      const screenName = (m[1] ?? "").toLowerCase();
      const tweetId = m[2] ?? "";
      if (!screenName || !tweetId) continue;
      if (screenName === self) continue;
      if (seen.has(tweetId)) continue;
      seen.set(tweetId, {
        tweetId,
        screenName,
        url: `https://x.com/${screenName}/status/${tweetId}`,
      });
    }
  };

  scan(html);

  // bing.com/ck/a 経由のリンクも復号してスキャン
  const ckRe = /href="(\/ck\/a\?[^"]+)"/gi;
  let cm: RegExpExecArray | null;
  while ((cm = ckRe.exec(html)) !== null) {
    const real = tryUnwrapBingRedirect(`https://www.bing.com${cm[1]}`);
    if (real && real !== cm[1]) scan(real);
  }

  return [...seen.values()];
}

/**
 * 指定スクリーンネームへの mention を Bing 検索で収集する。
 * - 失敗は呼び出し側で握り潰せるよう throw するが、
 *   `fetchBingMentionsSafe` を経由するのを推奨。
 */
export async function fetchBingMentionsToYou(
  screenName: string,
  options: { maxPages?: number } = {},
): Promise<BingMentionEntry[]> {
  const sn = screenName.replace(/^@+/, "").trim();
  if (!sn) return [];
  const maxPages = Math.max(1, options.maxPages ?? BING_DEFAULT_MAX_PAGES);

  const merged = new Map<string, BingMentionEntry>();
  let lastError: Error | null = null;

  for (let i = 0; i < maxPages; i++) {
    const first = i * 10 + 1;
    const url = buildBingUrl(sn, first);

    let html: string;
    try {
      html = await fetchBingHtml(url);
    } catch (e) {
      lastError = e as Error;
      // ページ単位の失敗は無視して次へ（取得済みは活かす）
      console.warn(`[bing] page ${i + 1} fetch failed:`, (e as Error).message);
      continue;
    }

    const entries = parseBingHtmlForTweets(html, sn);
    let added = 0;
    for (const e of entries) {
      if (!merged.has(e.tweetId)) {
        merged.set(e.tweetId, e);
        added++;
      }
    }

    // 新規が増えなかったら終端と判断して打ち切り
    if (added === 0 && i > 0) break;

    if (i < maxPages - 1) await sleep(randomDelayMs());
  }

  console.info(
    `[bing] @${sn}: collected ${merged.size} tweet(s)` +
      (lastError && merged.size === 0
        ? ` — all pages failed (${lastError.message})`
        : ""),
  );
  return [...merged.values()];
}

/** Yahoo と同じく screenName ごとに mention 数を集計 */
export function aggregateBingAuthors(
  entries: BingMentionEntry[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of entries) {
    const sn = (e.screenName || "unknown").toLowerCase();
    map[sn] = (map[sn] ?? 0) + 1;
  }
  return map;
}

/**
 * 例外を握り潰す安全版。Bing は補助ソースなので、失敗時は空配列＋警告ログ。
 */
export async function fetchBingMentionsSafe(
  screenName: string,
  options: { maxPages?: number } = {},
): Promise<BingMentionEntry[]> {
  try {
    return await fetchBingMentionsToYou(screenName, options);
  } catch (e) {
    console.warn("[bing] fetch failed:", (e as Error).message);
    return [];
  }
}
