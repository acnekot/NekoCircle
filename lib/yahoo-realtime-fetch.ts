import type {
  YahooPaginationResponse,
  YahooRealtimeEntry,
} from "@/types/yahoo-realtime";
import { getAppConfig } from "./app-config";
import tls from "node:tls";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { hasRankingConverged } from "./interactions/convergence";
import { normalizeUsername } from "./interactions/normalize";
import type { ScanMode } from "@/types/interaction";
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
/**
 * 每个方向最多抓取的页数（每页 40 条）的「出厂默认值」。
 *
 * 原先固定 100 页：无论账号有多少提及，每次生成都会向 Yahoo 发出约 200 个请求
 * （双向各 100 页），即使只有几十条提及的账号也一样，极易触发 Yahoo 按 IP 限流。
 * 实测常见账号的提及量在数十条量级，20 页（每方向 800 条）已足够覆盖。
 *
 * 这个值现在只是兜底：实际取值由管理画面「参数设置」的 yahoo_max_pages 决定
 * （DB > 环境变量 YAHOO_MAX_PAGES > 此处默认）。
 */
export const MAX_START_PARALLEL_PAGES = 20;
const ADAPTIVE_BATCH_PAGES = 5;
const FAST_MAX_ENTRIES = 500;
const DEEP_MAX_ENTRIES = 3000;
const YAHOO_REQUEST_TIMEOUT_MS = 12_000;
/** socks5 代理下降低并发，防止连接池耗尽导致超时。现由后台参数设置控制。 */

const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://search.yahoo.co.jp/realtime/search",
};

export function normalizeScreenName(raw: string): string {
  return normalizeUsername(raw);
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
    timeout: YAHOO_REQUEST_TIMEOUT_MS,
  });

  const tlsSocket = tls.connect({ socket: rawSocket, servername: host });
  tlsSocket.setTimeout(YAHOO_REQUEST_TIMEOUT_MS, () => {
    tlsSocket.destroy(new Error("Yahoo SOCKS request timeout"));
  });
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

/** HTTP(S) forward proxy 経由で Yahoo JSON を取得する。 */
async function fetchViaHttpProxy(
  urlStr: string,
  proxyUrl: string,
): Promise<YahooPaginationResponse> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      urlStr,
      {
        headers: YAHOO_HEADERS,
        agent: new HttpsProxyAgent(proxyUrl),
        timeout: YAHOO_REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status !== 200) {
            reject(new Error(`Yahoo API HTTP ${status}`));
            return;
          }
          try {
            resolve(
              JSON.parse(Buffer.concat(chunks).toString("utf8")) as YahooPaginationResponse,
            );
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("Yahoo proxy timeout")));
    request.on("error", reject);
  });
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
  // 代理从后台设置解析（DB > 环境变量 > 默认）。
  // 此前直接读环境变量，不重启就改不了。
  const appConfig = getAppConfig();
  const proxyUrl = appConfig.globalProxy;
  const yahooProxy = appConfig.yahooProxy;

  if (proxyUrl && /^socks/i.test(proxyUrl)) {
    const u = new URL(proxyUrl);
    return fetchViaSocks5(url, u.hostname, parseInt(u.port, 10));
  }

  if (proxyUrl && /^https?:/i.test(proxyUrl)) {
    return fetchViaHttpProxy(url, proxyUrl);
  }

  if (yahooProxy?.startsWith("http://")) {
    return fetchViaHttpProxy(url, yahooProxy);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(YAHOO_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (yahooProxy?.startsWith("https://")) {
      const relayUrl = `${yahooProxy}/pagination?${buildSearchParams(p, opts)}`;
      const relayRes = await fetch(relayUrl, {
        headers: YAHOO_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(YAHOO_REQUEST_TIMEOUT_MS),
      });
      if (!relayRes.ok) throw new Error(`Yahoo relay HTTP ${relayRes.status}`);
      return relayRes.json() as Promise<YahooPaginationResponse>;
    }
    throw error;
  }
  if (!res.ok && yahooProxy?.startsWith("https://")) {
    const relayRes = await fetch(
      `${yahooProxy}/pagination?${buildSearchParams(p, opts)}`,
      {
        headers: YAHOO_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(YAHOO_REQUEST_TIMEOUT_MS),
      },
    );
    if (relayRes.ok) {
      return relayRes.json() as Promise<YahooPaginationResponse>;
    }
  }
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
  options: {
    md?: string;
    maxPages?: number;
    maxEntries?: number;
    batchPages?: number;
  } = {},
): Promise<YahooRealtimeEntry[]> {
  // 配置只读一次，本次抓取期间沿用同一组值（中途变化会让行为难以推断）。
  const appConfig = getAppConfig();
  const configuredMaxPages = options.maxPages ?? appConfig.yahooMaxPages;
  const maxPages = Math.min(
    configuredMaxPages,
    (options.maxEntries ?? FAST_MAX_ENTRIES) > FAST_MAX_ENTRIES ? 30 : 20,
  );
  const parallelLimit = Math.max(1, appConfig.yahooParallelPages);
  const batchPages = Math.max(
    1,
    options.batchPages ?? ADAPTIVE_BATCH_PAGES,
  );
  const maxEntries = Math.max(1, options.maxEntries ?? FAST_MAX_ENTRIES);

  const byId = new Map<string, YahooRealtimeEntry>();
  let fetchedPages = 0;
  let totalAvailable: number | undefined;
  let previousTop: string[] = [];
  let stableRounds = 0;

  const addEntries = (entries: YahooRealtimeEntry[]): number => {
    let added = 0;
    for (const entry of entries) {
      if (!entry?.id || byId.has(entry.id)) continue;
      byId.set(entry.id, entry);
      added += 1;
      if (byId.size >= maxEntries) break;
    }
    return added;
  };

  // 先单独取第 1 页：响应里的 head.totalResultsAvailable 直接给出总条数，
  // 据此可知还要几页。若一上来就并发整块（8 页），小账号会白白多打 7 个请求，
  // 而这类"注定为空"的请求正是触发 Yahoo 按 IP 限流的主因。
  const first = await fetchPaginationJson(p, { start: 1, md: options.md });
  addEntries(getEntries(first));
  fetchedPages = 1;
  {
    const total = first.timeline?.head?.totalResultsAvailable;
    if (typeof total === "number" && Number.isFinite(total)) {
      totalAvailable = total;
    }
  }

  const neededPages = () =>
    totalAvailable === undefined
      ? Math.min(maxPages, Math.ceil(maxEntries / RESULTS_PER_PAGE))
      : Math.max(
          1,
          Math.min(
            Math.ceil(totalAvailable / RESULTS_PER_PAGE),
            Math.ceil(maxEntries / RESULTS_PER_PAGE),
          ),
        );

  while (fetchedPages < maxPages) {
    const want = Math.min(neededPages(), maxPages);
    if (fetchedPages >= want) break;

    const size = Math.min(batchPages, want - fetchedPages);
    const starts = Array.from(
      { length: size },
      (_, i) => (fetchedPages + i) * RESULTS_PER_PAGE + 1,
    );
    const settled: PromiseSettledResult<YahooPaginationResponse>[] = [];
    for (let offset = 0; offset < starts.length; offset += parallelLimit) {
      settled.push(
        ...(await Promise.allSettled(
          starts
            .slice(offset, offset + parallelLimit)
            .map((start) =>
              fetchPaginationJson(p, { start, md: options.md }),
            ),
        )),
      );
    }
    fetchedPages += size;
    const part = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    for (const result of settled) {
      if (result.status === "rejected") {
        console.warn("[yahoo-fetch] page failed:", result.reason);
      }
    }

    let received = 0;
    let added = 0;
    for (const res of part) {
      if (totalAvailable === undefined) {
        const total = res.timeline?.head?.totalResultsAvailable;
        if (typeof total === "number" && Number.isFinite(total)) {
          totalAvailable = total;
        }
      }
      const entries = getEntries(res);
      received += entries.length;
      added += addEntries(entries);
    }

    // 整块为空说明已到时间线末端。
    if (part.every((res) => getEntries(res).length === 0)) break;
    if (byId.size >= maxEntries) break;

    const currentTop = topYahooActors([...byId.values()], p);
    if (
      previousTop.length > 0 &&
      hasRankingConverged(previousTop, currentTop)
    ) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }
    previousTop = currentTop;

    const addedRatio = received === 0 ? 0 : added / received;
    if (addedRatio < 0.05 || stableRounds >= 2) break;
  }

  // 观测点：每次抓取的页数/总量。此前无法看到请求规模，正是限流问题的盲区。
  console.error(
    `[yahoo-fetch] p=${p} pages=${fetchedPages} total=${totalAvailable ?? "?"} entries=${byId.size}`,
  );
  return [...byId.values()];
}

function topYahooActors(entries: YahooRealtimeEntry[], query: string): string[] {
  const counts = new Map<string, number>();
  const outgoing = /^ID:/i.test(query);
  const self = normalizeUsername(query.replace(/^(?:ID:|@)/i, ""));
  for (const entry of entries) {
    const names = outgoing
      ? (entry.mentions ?? []).map((mention) => mention.screenName ?? "")
      : [entry.screenName ?? ""];
    for (const raw of names) {
      const name = normalizeUsername(raw);
      if (!name || name === self) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([name]) => name);
}

export function isOutgoingMentionTweet(
  entry: YahooRealtimeEntry,
): boolean {
  const m = entry.mentions;
  return Array.isArray(m) && m.length > 0;
}

export async function fetchMentionsToYou(
  screenName: string,
  options: { mode?: ScanMode } = {},
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `@${name}`;
  const limit = options.mode === "deep" ? DEEP_MAX_ENTRIES : FAST_MAX_ENTRIES;
  const entries = await fetchByStartParallel(p, { maxEntries: limit });
  return entries.slice(0, limit);
}

export async function fetchMentionsFromYou(
  screenName: string,
  options: { mode?: ScanMode } = {},
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `ID:${name}`;

  const limit = options.mode === "deep" ? DEEP_MAX_ENTRIES : FAST_MAX_ENTRIES;
  const firstBatch = await fetchByStartParallel(p, { maxEntries: limit });
  const collected: YahooRealtimeEntry[] = [];
  const seen = new Set<string>();

  const pushFiltered = (list: YahooRealtimeEntry[]) => {
    for (const e of list) {
      if (!e?.id || seen.has(e.id)) continue;
      if (!isOutgoingMentionTweet(e)) continue;
      seen.add(e.id);
      collected.push(e);
      if (collected.length >= limit) return;
    }
  };

  pushFiltered(firstBatch);
  if (collected.length >= limit) {
    return collected.slice(0, limit);
  }

  let cursor = oldestTweetIdInBatch(firstBatch);

  let guard = 0;
  const maxCursorPages = 30;
  let previousTop = topYahooActors(collected, p);
  let stableRounds = 0;

  while (collected.length < limit && cursor && guard < maxCursorPages) {
    guard += 1;
    const data = await fetchPaginationJson(p, { oldestTweetId: cursor });
    const page = getEntries(data);
    if (page.length === 0) break;

    const before = collected.length;
    pushFiltered(page);
    const added = collected.length - before;
    const currentTop = topYahooActors(collected, p);
    if (hasRankingConverged(previousTop, currentTop)) stableRounds += 1;
    else stableRounds = 0;
    previousTop = currentTop;
    const next =
      data.timeline?.head?.oldestTweetId ??
      page.at(-1)?.id ??
      oldestTweetIdInBatch(page) ??
      null;
    if (!next || next === cursor) break;
    cursor = next;
    if (added / Math.max(1, page.length) < 0.05 || stableRounds >= 2) break;
  }

  return collected.slice(0, limit);
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

export async function fetchMentionsBothParallel(
  screenName: string,
  options: { mode?: ScanMode } = {},
): Promise<{
  mentionsToYou: YahooRealtimeEntry[];
  mentionsFromYou: YahooRealtimeEntry[];
  failures: Array<"inbound" | "outbound">;
}> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");

  const [toResult, fromResult] = await Promise.allSettled([
    fetchMentionsToYou(name, options),
    fetchMentionsFromYou(name, options),
  ]);
  if (toResult.status === "rejected" && fromResult.status === "rejected") {
    throw new AggregateError(
      [toResult.reason, fromResult.reason],
      "Yahoo inbound and outbound requests both failed",
    );
  }
  return {
    mentionsToYou: toResult.status === "fulfilled" ? toResult.value : [],
    mentionsFromYou: fromResult.status === "fulfilled" ? fromResult.value : [],
    failures: [
      ...(toResult.status === "rejected" ? (["inbound"] as const) : []),
      ...(fromResult.status === "rejected" ? (["outbound"] as const) : []),
    ],
  };
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
