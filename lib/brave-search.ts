/**
 * Brave Search API 草稿：用于替代 Bing HTML 抓取的 mention 兜底。
 *
 * 状态：只提供请求构造、分页和解析，尚未接入 lib/circle-payload.ts，生产流程不变。
 * 核对情况：参数与响应字段依据第三方整理的文档摘要。官方文档站在核对环境被拦截，
 * 接入前需要用真实 key 确认 count、offset、freshness 的上限，以及 site: 与 OR 语法是否生效。
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
/** pw = 过去一周，与 Bing 版本的 freshness=Week 对齐。 */
const BRAVE_DEFAULT_FRESHNESS = "pw";

const TWEET_URL_RE =
  /https?:\/\/(?:mobile\.|m\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/gi;

export type BraveMentionEntry = {
  tweetId: string;
  screenName: string;
  url: string;
};

/** Brave 网页搜索响应中本模块用到的字段。 */
export type BraveWebResponse = {
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

/**
 * 从每条结果的 URL、标题和摘要里提取 X 推文链接，并按 tweetId 去重。
 * 正则与 Bing 版本一致；自己的推文不计入。
 */
export function parseBraveResults(
  response: BraveWebResponse,
  screenName: string,
): BraveMentionEntry[] {
  const self = normalizeName(screenName);
  const seen = new Map<string, BraveMentionEntry>();
  for (const result of response.web?.results ?? []) {
    for (const text of [result.url, result.title, result.description]) {
      if (!text) continue;
      for (const match of text.matchAll(TWEET_URL_RE)) {
        const screen = (match[1] ?? "").toLowerCase();
        const tweetId = match[2] ?? "";
        if (!screen || !tweetId || screen === self || seen.has(tweetId)) continue;
        seen.set(tweetId, {
          tweetId,
          screenName: screen,
          url: `https://x.com/${screen}/status/${tweetId}`,
        });
      }
    }
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
 * - 某一页没有新增推文就停止，避免在 offset 语义不符合预期时空转。
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

    let added = 0;
    for (const entry of parseBraveResults(response, sn)) {
      if (merged.has(entry.tweetId)) continue;
      merged.set(entry.tweetId, entry);
      added += 1;
    }
    if (added === 0) break;
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
