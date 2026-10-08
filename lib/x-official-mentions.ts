/**
 * X 官方 API（按量计费）的 mentions 适配器草稿。
 *
 * 状态：只提供请求构造、分页和解析，未接入生产流程，也不读取任何密钥。
 * 接入前必须先完成 docs/x-data-compliance.md 中的条款核对，并在控制台确认单价。
 * 核对情况：端点、参数和响应结构依据第三方整理的文档摘要，官方参考页在核对环境被拦截。
 * 以下几点需要用真实 token 验证：max_results 的下限、since_id 的边界、
 * 历史上限（旧资料称 800 条）、作者资料是否另行计费。
 */
import { normalizeInteractionText } from "./interactions/text";
import { normalizeUsername } from "./interactions/normalize";

const X_API_BASE = "https://api.x.com/2";
/** 单页条数上限（第三方整理）。 */
const X_MAX_RESULTS = 100;
/** 旧资料称 mentions 只能返回最近 800 条，未确认是否仍然有效。 */
const X_MENTIONS_HISTORY_CAP = 800;
const X_DEFAULT_MAX_PAGES = 8;
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

/** 组装 mentions 请求地址。作者资料通过 expansions 放进 includes。 */
export function buildMentionsUrl(
  userId: string,
  options: { paginationToken?: string; sinceId?: string; maxResults?: number } = {},
): string {
  if (!isNumericId(userId)) throw new Error("userId 必须是数字 ID");
  const params = new URLSearchParams({
    max_results: String(options.maxResults ?? X_MAX_RESULTS),
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
 * 每条返回的帖子都会计费，因此默认最多 8 页、800 条（按 $0.005/条约 $4）。
 * 首页失败直接抛出；之后的页面失败（例如限流 429）则保留已经拿到的结果。
 */
export async function fetchXMentionsOfficial(
  userId: string,
  options: XRequestOptions & { maxPages?: number; maxMentions?: number; sinceId?: string },
): Promise<XMentionEntry[]> {
  const maxPages = Math.max(1, options.maxPages ?? X_DEFAULT_MAX_PAGES);
  const maxMentions = Math.min(
    X_MENTIONS_HISTORY_CAP,
    Math.max(1, options.maxMentions ?? X_MENTIONS_HISTORY_CAP),
  );
  const merged = new Map<string, XMentionEntry>();
  let token: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    let body: XMentionsResponse;
    try {
      body = await fetchXJson<XMentionsResponse>(
        buildMentionsUrl(userId, { paginationToken: token, sinceId: options.sinceId }),
        options,
      );
    } catch (error) {
      if (page === 0) throw error;
      break;
    }

    const usernames = new Map<string, string>();
    for (const user of body.includes?.users ?? []) {
      if (user.id && user.username) usernames.set(user.id, normalizeUsername(user.username));
    }

    for (const tweet of body.data ?? []) {
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

    token = body.meta?.next_token;
    if (!token) break;
  }
  return [...merged.values()];
}
