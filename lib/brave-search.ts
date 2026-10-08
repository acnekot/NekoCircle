/**
 * Brave Search API 草稿：用于替代 Bing HTML 抓取的 mention 兜底。
 *
 * 状态：只提供请求构造、分页和解析，尚未接入 lib/circle-payload.ts，生产流程不变。
 * 核对情况：参数与响应字段依据第三方整理的文档摘要。官方文档站在核对环境被拦截，
 * 接入前需要用真实 key 确认 count、offset、freshness 的上限，以及 site: 与 OR 语法是否生效。
 * query.more_results_available 字段来自代码审查意见，同样未能在本环境核对；字段缺失时停止条件不变。
 *
 * 取舍：解析偏向精确率。只采纳结果 URL 本身是 `/用户名/status/ID` 的 X 推文，并默认要求标题或摘要里
 * 出现 `@自己`。摘要被截断时可能漏掉真实提及，用真实 key 评估召回时可以设置 requireMention: false 对比。
 * `/i/web/status/ID` 这种不带用户名的地址无法确定作者，不能计入互动，所以有意忽略。
 */

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
/** 单页条数上限（第三方整理）。 */
const BRAVE_PAGE_SIZE = 20;
/** offset 上限（第三方整理）。 */
const BRAVE_MAX_OFFSET = 9;
const BRAVE_TIMEOUT_MS = 10_000;
/** 免费档每秒请求数未核实，页与页之间保守等待 1 秒。 */
const BRAVE_DEFAULT_DELAY_MS = 1_000;
const BRAVE_DEFAULT_MAX_PAGES = 5;
/** 连续这么多页没有新增推文就停止。分页结果可能重叠，所以允许中间夹一页重复内容。 */
const BRAVE_MAX_EMPTY_PAGES = 2;
/** pw = 过去一周，与 Bing 版本的 freshness=Week 对齐。 */
const BRAVE_DEFAULT_FRESHNESS = "pw";

/** 只认 X 站内的域名；把 X 链接放在参数里的跳转页不算。 */
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);
/** 路径必须是 /用户名/status/ID。/i/web/status/ID 不带用户名，无法确定作者，有意不识别。 */
const STATUS_PATH_RE = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})(?:\/|$)/i;

export type BraveMentionEntry = {
  tweetId: string;
  screenName: string;
  url: string;
};

/** Brave 网页搜索响应中本模块用到的字段。 */
export type BraveWebResponse = {
  query?: { more_results_available?: boolean };
  web?: {
    results?: Array<{
      url?: string;
      title?: string;
      description?: string;
    }>;
  };
};

export class BraveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BraveApiError";
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type BraveSearchOptions = {
  apiKey: string;
  maxPages?: number;
  freshness?: string;
  delayMs?: number;
  /**
   * 是否要求标题或摘要里出现 `@自己`，默认要求（宁可漏掉也不误报）。
   * 摘要被截断时可能漏掉真实提及，评估召回时可以关闭后对比。
   */
  requireMention?: boolean;
  /** 测试时注入；默认使用全局 fetch。 */
  fetchImpl?: FetchLike;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** 用户名只允许 X 的合法字符，避免拼进查询串后改变搜索语义。 */
function isValidScreenName(name: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(name);
}

/** 组装查询：`"@name" (site:x.com OR site:twitter.com)`。 */
export function buildBraveQuery(screenName: string): string {
  return `"@${normalizeName(screenName)}" (site:x.com OR site:twitter.com)`;
}

/** 只带查询参数。API key 走请求头，不出现在地址里。 */
export function buildBraveUrl(
  screenName: string,
  options: { offset?: number; count?: number; freshness?: string } = {},
): string {
  const params = new URLSearchParams({
    q: buildBraveQuery(screenName),
    count: String(options.count ?? BRAVE_PAGE_SIZE),
    offset: String(options.offset ?? 0),
    freshness: options.freshness ?? BRAVE_DEFAULT_FRESHNESS,
  });
  return `${BRAVE_SEARCH_URL}?${params.toString()}`;
}

/** 从结果的 URL 里取出 X 推文的作者和 ID；不是 X 站内的推文地址返回 undefined。 */
function tweetRefFromUrl(raw: string): { screenName: string; tweetId: string } | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !X_HOSTS.has(url.hostname.toLowerCase())) return undefined;
  const match = STATUS_PATH_RE.exec(url.pathname);
  if (!match) return undefined;
  return { screenName: (match[1] ?? "").toLowerCase(), tweetId: match[2] ?? "" };
}

/**
 * 解析一页结果，按 tweetId 去重，自己的推文不计入。
 * 只采纳结果的 URL 本身是 X 推文的条目；默认还要求标题或摘要里出现 `@自己`（requireMention）：
 * 摘要里引用的别人的推文、第三方页面里的链接都不会被当成提及。
 */
export function parseBraveResults(
  response: BraveWebResponse,
  screenName: string,
  options: { requireMention?: boolean } = {},
): BraveMentionEntry[] {
  const self = normalizeName(screenName);
  if (!isValidScreenName(self)) return [];
  const requireMention = options.requireMention ?? true;
  const mention = new RegExp(`@${self}(?![A-Za-z0-9_])`, "i");
  const seen = new Map<string, BraveMentionEntry>();
  for (const result of response.web?.results ?? []) {
    if (requireMention && !mention.test(`${result.title ?? ""} ${result.description ?? ""}`)) continue;
    const ref = tweetRefFromUrl(result.url ?? "");
    if (!ref || !ref.tweetId || ref.screenName === self || seen.has(ref.tweetId)) continue;
    seen.set(ref.tweetId, {
      tweetId: ref.tweetId,
      screenName: ref.screenName,
      url: `https://x.com/${ref.screenName}/status/${ref.tweetId}`,
    });
  }
  return [...seen.values()];
}

async function fetchBravePage(
  url: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<BraveWebResponse> {
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(BRAVE_TIMEOUT_MS),
  });
  if (!res.ok) throw new BraveApiError(`Brave HTTP ${res.status}`, res.status);
  return (await res.json()) as BraveWebResponse;
}

/**
 * 逐页抓取 `@name` 的提及。
 * - 结果为空、响应表示没有更多结果，或连续两页没有新增推文时停止。
 * - 第一页失败直接抛出；之后的页面失败（例如限流 429）则保留已经拿到的结果。
 */
export async function fetchBraveMentionsToYou(
  screenName: string,
  options: BraveSearchOptions,
): Promise<BraveMentionEntry[]> {
  const sn = normalizeName(screenName);
  if (!isValidScreenName(sn)) return [];
  const maxPages = Math.min(
    Math.max(0, options.maxPages ?? BRAVE_DEFAULT_MAX_PAGES),
    BRAVE_MAX_OFFSET + 1,
  );
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((url, init) => fetch(url, init));
  const delayMs = options.delayMs ?? BRAVE_DEFAULT_DELAY_MS;
  const merged = new Map<string, BraveMentionEntry>();
  let emptyPages = 0;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(delayMs);
    let response: BraveWebResponse;
    try {
      response = await fetchBravePage(
        buildBraveUrl(sn, { offset: page, freshness: options.freshness }),
        options.apiKey,
        fetchImpl,
      );
    } catch (error) {
      if (page === 0) throw error;
      break;
    }

    // 没有结果，说明已经到末尾。
    if ((response.web?.results ?? []).length === 0) break;

    const before = merged.size;
    for (const entry of parseBraveResults(response, sn, { requireMention: options.requireMention })) {
      if (!merged.has(entry.tweetId)) merged.set(entry.tweetId, entry);
    }
    emptyPages = merged.size === before ? emptyPages + 1 : 0;
    if (emptyPages >= BRAVE_MAX_EMPTY_PAGES) break;
    if (response.query?.more_results_available === false) break;
  }
  return [...merged.values()];
}

/**
 * 不抛错的版本。没有 key 时直接返回空数组，不发任何请求。
 * 日志只打印错误信息，不打印 key 或请求头。
 */
export async function fetchBraveMentionsSafe(
  screenName: string,
  options: BraveSearchOptions,
): Promise<BraveMentionEntry[]> {
  if (!options.apiKey) return [];
  try {
    return await fetchBraveMentionsToYou(screenName, options);
  } catch (error) {
    console.warn("[brave] fetch failed:", (error as Error).message);
    return [];
  }
}
