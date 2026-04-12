import type {
  YahooPaginationResponse,
  YahooRealtimeEntry,
} from "@/types/yahoo-realtime";
import tls from "node:tls";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SocksClient } = require("socks") as typeof import("socks");

function normalizeYahooProfileImageUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = t.startsWith("//") ? `https:${t}` : t;
  if (!/^https:\/\//i.test(u)) return null;
  try {
    if (new URL(u).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return u;
}

/** あなた宛メンションの投稿者 → Yahoo の profileImage（仮アイコン用） */
export function buildYahooAuthorProfileImageMap(
  mentionsToYou: YahooRealtimeEntry[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of mentionsToYou) {
    const sn = e.screenName?.trim();
    if (!sn) continue;
    const key = sn.toLowerCase();
    if (map[key]) continue;
    const u = normalizeYahooProfileImageUrl(e.profileImage ?? "");
    if (u) map[key] = u;
  }
  return map;
}

/** 本人投稿タイムラインの先頭付近の profileImage（自分の仮アイコン） */
export function pickSelfProfileImageFromYahoo(
  mentionsFromYou: YahooRealtimeEntry[],
): string | null {
  for (const e of mentionsFromYou) {
    const u = normalizeYahooProfileImageUrl(e.profileImage ?? "");
    if (u) return u;
  }
  return null;
}

const YAHOO_RT = "https://search.yahoo.co.jp/realtime/api/v1/pagination";
export const RESULTS_PER_PAGE = 40;
export const MAX_START_PARALLEL_PAGES = 100;
/** socks5 代理下降低并发，防止连接池耗尽导致超时 */
const YAHOO_PARALLEL_CHUNK = 8;

const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://search.yahoo.co.jp/realtime/search",
};

export function normalizeScreenName(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function buildSearchParams(
  p: string,
  opts: {
    start?: number;
    oldestTweetId?: string;
    md?: string;
  },
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("p", p);
  q.set("results", String(RESULTS_PER_PAGE));
  if (opts.md !== undefined) q.set("md", opts.md);
  if (opts.start !== undefined) q.set("start", String(opts.start));
  if (opts.oldestTweetId) q.set("oldestTweetId", opts.oldestTweetId);
  return q;
}

/** SOCKS5 + TLS で HTTPS URL を取得し、JSON をパースして返す（プロキシ必須環境用）*/
async function fetchViaSocks5(
  urlStr: string,
  proxyHost: string,
  proxyPort: number,
  retries = 2,
): Promise<YahooPaginationResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchViaSocks5Once(urlStr, proxyHost, proxyPort);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

async function fetchViaSocks5Once(
  urlStr: string,
  proxyHost: string,
  proxyPort: number,
): Promise<YahooPaginationResponse> {
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
    ...Object.entries(YAHOO_HEADERS).map(([k, v]) => `${k}: ${v}`),
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

  // 找到 HTTP header/body 分隔线
  const bodyStart = raw.indexOf("\r\n\r\n");
  if (bodyStart === -1) throw new Error("Invalid HTTP response");
  let body = raw.slice(bodyStart + 4);

  const statusLine = raw.split("\r\n")[0] ?? "";
  const statusCode = parseInt(statusLine.split(" ")[1] ?? "0", 10);
  if (statusCode !== 200) throw new Error(`Yahoo API HTTP ${statusCode}`);

  // 正确解码 chunked transfer encoding
  if (raw.includes("Transfer-Encoding: chunked") || raw.includes("transfer-encoding: chunked")) {
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

  return JSON.parse(body) as YahooPaginationResponse;
}

async function fetchPaginationJson(
  p: string,
  opts: {
    start?: number;
    oldestTweetId?: string;
    md?: string;
  },
): Promise<YahooPaginationResponse> {
  const url = `${YAHOO_RT}?${buildSearchParams(p, opts)}`;
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (proxyUrl && /^socks/i.test(proxyUrl)) {
    const u = new URL(proxyUrl);
    return fetchViaSocks5(url, u.hostname, parseInt(u.port, 10));
  }

  const res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Yahoo API HTTP ${res.status} (${url.slice(0, 120)}…)`);
  }
  return res.json() as Promise<YahooPaginationResponse>;
}

export function getEntries(data: YahooPaginationResponse): YahooRealtimeEntry[] {
  return data.timeline?.entry ?? [];
}

export async function fetchByStartParallel(
  p: string,
  options: { md?: string; maxPages?: number } = {},
): Promise<YahooRealtimeEntry[]> {
  const maxPages = options.maxPages ?? MAX_START_PARALLEL_PAGES;
  const starts = Array.from(
    { length: maxPages },
    (_, i) => i * RESULTS_PER_PAGE + 1,
  );

  const flat: YahooRealtimeEntry[][] = [];
  for (let i = 0; i < starts.length; i += YAHOO_PARALLEL_CHUNK) {
    const chunk = starts.slice(i, i + YAHOO_PARALLEL_CHUNK);
    const part = await Promise.all(
      chunk.map((start) =>
        fetchPaginationJson(p, { start, md: options.md }).then(getEntries),
      ),
    );
    flat.push(...part);
  }

  const byId = new Map<string, YahooRealtimeEntry>();
  for (const entry of flat.flat()) {
    if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export function isOutgoingMentionTweet(
  entry: YahooRealtimeEntry,
): boolean {
  const m = entry.mentions;
  return Array.isArray(m) && m.length > 0;
}

export async function fetchMentionsToYou(
  screenName: string,
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `@${name}`;
  const entries = await fetchByStartParallel(p, {});
  return entries.slice(0, 10000);
}

export async function fetchMentionsFromYou(
  screenName: string,
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `ID:${name}`;

  const firstBatch = await fetchByStartParallel(p, {});
  const collected: YahooRealtimeEntry[] = [];
  const seen = new Set<string>();

  const pushFiltered = (list: YahooRealtimeEntry[]) => {
    for (const e of list) {
      if (!e?.id || seen.has(e.id)) continue;
      if (!isOutgoingMentionTweet(e)) continue;
      seen.add(e.id);
      collected.push(e);
      if (collected.length >= 10000) return;
    }
  };

  pushFiltered(firstBatch);
  if (collected.length >= 10000) {
    return collected.slice(0, 10000);
  }

  let cursor = oldestTweetIdInBatch(firstBatch);

  let guard = 0;
  const maxCursorPages = 500;

  while (collected.length < 10000 && cursor && guard < maxCursorPages) {
    guard += 1;
    const data = await fetchPaginationJson(p, { oldestTweetId: cursor });
    const page = getEntries(data);
    if (page.length === 0) break;

    pushFiltered(page);
    const next =
      data.timeline?.head?.oldestTweetId ??
      page.at(-1)?.id ??
      oldestTweetIdInBatch(page) ??
      null;
    if (!next || next === cursor) break;
    cursor = next;
  }

  return collected.slice(0, 10000);
}

function oldestTweetIdInBatch(entries: YahooRealtimeEntry[]): string | undefined {
  let min: bigint | undefined;
  let minId: string | undefined;
  for (const e of entries) {
    if (!e.id) continue;
    try {
      const n = BigInt(e.id);
      if (min === undefined || n < min) {
        min = n;
        minId = e.id;
      }
    } catch {
      if (minId === undefined) minId = e.id;
    }
  }
  return minId;
}

export async function fetchMentionsBothParallel(screenName: string): Promise<{
  mentionsToYou: YahooRealtimeEntry[];
  mentionsFromYou: YahooRealtimeEntry[];
}> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");

  const [mentionsToYou, mentionsFromYou] = await Promise.all([
    fetchMentionsToYou(name),
    fetchMentionsFromYou(name),
  ]);

  return { mentionsToYou, mentionsFromYou };
}

export function aggregateMentionAuthors(
  mentionsToYou: YahooRealtimeEntry[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of mentionsToYou) {
    const sn = (e.screenName ?? "unknown").toLowerCase();
    map[sn] = (map[sn] ?? 0) + 1;
  }
  return map;
}

export function aggregateMentionTargets(
  mentionsFromYou: YahooRealtimeEntry[],
  selfScreenName: string,
): Record<string, number> {
  const self = selfScreenName.toLowerCase();
  const map: Record<string, number> = {};
  for (const e of mentionsFromYou) {
    for (const m of e.mentions ?? []) {
      const t = (m.screenName ?? "").toLowerCase();
      if (!t || t === self) continue;
      map[t] = (map[t] ?? 0) + 1;
    }
  }
  return map;
}
