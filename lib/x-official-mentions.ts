/**
 * X 官方 API（按量计费）的 mentions 适配器草稿。
 *
 * 状态：只提供请求构造、分页和解析，未接入生产流程，也不读取任何密钥。
 * 接入前必须先完成 docs/x-data-compliance.md 中的条款核对，并在控制台确认单价。
 * 核对情况：端点、参数和响应结构依据第三方整理的文档摘要，官方参考页在核对环境被拦截。
 * 以下几点需要用真实 token 验证：max_results 的下限（代码按 5 处理）、since_id 的边界、
 * 历史上限（旧资料称 800 条）、作者资料是否另行计费。
 *
 * 计费边界：maxMentions 约束的是 mention 帖子的返回数，计费也按返回数，包括重复的。
 * 单页下限按 5 条处理，所以最多会多收 4 条。用户 ID 查询是另一次请求，不在这个预算内；
 * 跨调用的重复获取不会被去重，调用方应当缓存用户 ID 和已经取过的结果。
 */
import { normalizeInteractionText } from "./interactions/text";
import { normalizeUsername } from "./interactions/normalize";

const X_API_BASE = "https://api.x.com/2";
/** 单页条数的上限与下限（第三方整理，下限未在官方参考页核对）。 */
const X_MAX_RESULTS = 100;
const X_MIN_RESULTS = 5;
/** 旧资料称 mentions 只能返回最近 800 条，未确认是否仍然有效。 */
const X_MENTIONS_HISTORY_CAP = 800;
/** 页数硬上限：历史上限除以单页上限。调用方传入的 maxPages 不能超过它。 */
const X_MAX_PAGES = X_MENTIONS_HISTORY_CAP / X_MAX_RESULTS;
const X_TIMEOUT_MS = 10_000;

export type XMentionEntry = {
  tweetId: string;
  authorId: string;
  screenName?: string;
  text: string;
  createdAt?: string;
};

type XMentionsResponse = {
  data?: Array<{ id?: string; text?: string; author_id?: string; created_at?: string }>;
  includes?: { users?: Array<{ id?: string; username?: string }> };
  meta?: { result_count?: number; next_token?: string };
};

type XUserResponse = { data?: { id?: string; username?: string } };

export class XApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type XRequestOptions = {
  bearerToken: string;
  /** 测试时注入；默认使用全局 fetch。 */
  fetchImpl?: FetchLike;
};

function isValidScreenName(name: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(name);
}

function isNumericId(value: string): boolean {
  return /^\d{1,25}$/.test(value);
}

/** token 只放在请求头里，错误信息里也不包含 token。 */
async function fetchXJson<T>(url: string, options: XRequestOptions): Promise<T> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((u, init) => fetch(u, init));
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${options.bearerToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(X_TIMEOUT_MS),
  });
  if (!res.ok) throw new XApiError(`X API HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** 用户名 -> 数字 ID。mentions 端点只接受数字 ID。 */
export async function resolveXUserId(
  username: string,
  options: XRequestOptions,
): Promise<string | undefined> {
  const name = normalizeUsername(username);
  if (!isValidScreenName(name)) return undefined;
  const body = await fetchXJson<XUserResponse>(
    `${X_API_BASE}/users/by/username/${encodeURIComponent(name)}`,
    options,
  );
  const id = body.data?.id;
  return id && isNumericId(id) ? id : undefined;
}

/** 组装 mentions 请求地址。max_results 被限制在 5 到 100 之间。作者资料通过 expansions 放进 includes。 */
export function buildMentionsUrl(
  userId: string,
  options: { paginationToken?: string; sinceId?: string; maxResults?: number } = {},
): string {
  if (!isNumericId(userId)) throw new Error("userId 必须是数字 ID");
  const maxResults = Math.min(
    X_MAX_RESULTS,
    Math.max(X_MIN_RESULTS, Math.floor(options.maxResults ?? X_MAX_RESULTS)),
  );
  const params = new URLSearchParams({
    max_results: String(maxResults),
    expansions: "author_id",
    "tweet.fields": "created_at,author_id",
    "user.fields": "username",
  });
  if (options.paginationToken) params.set("pagination_token", options.paginationToken);
  if (options.sinceId) {
    if (!isNumericId(options.sinceId)) throw new Error("sinceId 必须是数字 ID");
    params.set("since_id", options.sinceId);
  }
  return `${X_API_BASE}/users/${userId}/mentions?${params.toString()}`;
}

/**
 * 逐页拉取 mentions，按 tweetId 去重。
 * 页数和条数都有硬上限，next_token 重复时停止。预算按每页实际返回的帖子数扣减，
 * 每页请求的 max_results 只取剩余预算需要的数量。
 * 首页失败直接抛出；之后的页面失败（例如限流 429）则保留已经拿到的结果。
 */
export async function fetchXMentionsOfficial(
  userId: string,
  options: XRequestOptions & { maxPages?: number; maxMentions?: number; sinceId?: string },
): Promise<XMentionEntry[]> {
  const maxPages = Math.min(X_MAX_PAGES, Math.max(1, options.maxPages ?? X_MAX_PAGES));
  const maxMentions = Math.min(
    X_MENTIONS_HISTORY_CAP,
    Math.max(1, options.maxMentions ?? X_MENTIONS_HISTORY_CAP),
  );
  const merged = new Map<string, XMentionEntry>();
  const seenTokens = new Set<string>();
  let token: string | undefined;
  let returned = 0;

  for (let page = 0; page < maxPages && returned < maxMentions; page++) {
    let body: XMentionsResponse;
    try {
      body = await fetchXJson<XMentionsResponse>(
        buildMentionsUrl(userId, {
          paginationToken: token,
          sinceId: options.sinceId,
          maxResults: maxMentions - returned,
        }),
        options,
      );
    } catch (error) {
      if (page === 0) throw error;
      break;
    }

    const data = body.data ?? [];
    returned += data.length;

    const usernames = new Map<string, string>();
    for (const user of body.includes?.users ?? []) {
      if (user.id && user.username) usernames.set(user.id, normalizeUsername(user.username));
    }

    for (const tweet of data) {
      if (!tweet.id || !tweet.author_id || merged.has(tweet.id)) continue;
      merged.set(tweet.id, {
        tweetId: tweet.id,
        authorId: tweet.author_id,
        screenName: usernames.get(tweet.author_id),
        text: normalizeInteractionText(tweet.text) ?? "",
        createdAt: tweet.created_at,
      });
      if (merged.size >= maxMentions) return [...merged.values()];
    }

    const next = body.meta?.next_token;
    // 没有下一页，或者 token 重复（服务端可能在循环）时停止。
    if (!next || seenTokens.has(next)) break;
    seenTokens.add(next);
    token = next;
  }
  return [...merged.values()];
}
