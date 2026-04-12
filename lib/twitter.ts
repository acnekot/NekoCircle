import {
  mockGetUserInfo, mockGetUserTweets, mockGetReplies,
  mockGetRetweets, mockGetQuotes, mockGetMentions, mockGetThreadContext,
} from "./mock";

const BASE = "https://api.twitterapi.io";
const AUTO_SLOW_MS = 5500;

type KeyState = { key: string; lastUsed: number };
let keyPool: KeyState[] = [];
let slowMode = false;
let mockMode = false;
let manualSlow = false;
let manualRateMs = 1000;

export function setApiKeys(keys: string[]) {
  keyPool = keys.filter(Boolean).map((key) => ({ key: key.trim(), lastUsed: 0 }));
  slowMode = false;
}
export function setMockMode(v: boolean) { mockMode = v; }
export function setManualSlowMode(enabled: boolean, rateMs = 1000) {
  manualSlow = enabled;
  manualRateMs = rateMs;
}
export function isMockMode() { return mockMode; }
export function isSlowMode() { return slowMode || manualSlow; }
export function getEffectiveRateMs() {
  if (slowMode) return AUTO_SLOW_MS;
  if (manualSlow) return manualRateMs;
  return 0;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function getNextKey(rateMs: number, signal?: AbortSignal): Promise<KeyState> {
  if (keyPool.length === 0) throw new Error("未配置 API Key");
  if (rateMs <= 0) return keyPool[Date.now() % keyPool.length];
  const now = Date.now();
  let best = keyPool[0];
  for (const state of keyPool) {
    if (state.lastUsed + rateMs <= now) { best = state; break; }
    if (state.lastUsed < best.lastUsed) best = state;
  }
  const wait = best.lastUsed + rateMs - Date.now();
  if (wait > 0) await abortableSleep(wait, signal);
  best.lastUsed = Date.now();
  return best;
}

function invalidateKey(key: string) {
  keyPool = keyPool.filter((state) => state.key !== key);
}

async function apiFetch(path: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const fallbackOnly = { key: apiKey, lastUsed: 0 };
  let lastStatus = 0;
  let lastBody = "";

  while (true) {
    const rateMs = getEffectiveRateMs();
    const keyState = keyPool.length > 0 ? await getNextKey(rateMs, signal) : fallbackOnly;
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": keyState.key },
      cache: "no-store",
      signal,
    });

    if (res.status === 401) {
      lastStatus = 401;
      lastBody = await res.text();
      if (keyPool.length > 1) {
        console.warn(`[auth] invalid api key skipped (${keyState.key.slice(0, 4)}...)`);
        invalidateKey(keyState.key);
        continue;
      }
      throw new Error(`Twitter API error 401: ${lastBody}`);
    }

    if (res.status === 429) {
      if (!slowMode) {
        slowMode = true;
        console.log("[rate-limit] 429 → auto slow mode");
      }
      await abortableSleep(AUTO_SLOW_MS, signal);
      const retry = await fetch(`${BASE}${path}`, { headers: { "x-api-key": keyState.key }, cache: "no-store", signal });
      if (retry.status === 401 && keyPool.length > 1) {
        invalidateKey(keyState.key);
        continue;
      }
      if (!retry.ok) throw new Error(`Twitter API error ${retry.status}: ${await retry.text()}`);
      return retry.json();
    }

    if (!res.ok) {
      lastStatus = res.status;
      lastBody = await res.text();
      throw new Error(`Twitter API error ${lastStatus}: ${lastBody}`);
    }

    return res.json();
  }
}

export type TwitterUser = {
  id: string;
  userName: string;
  name: string;
  profilePicture: string;
  followers: number;
  isBlueVerified: boolean;
  isProtected: boolean;
};

export type TweetMention = {
  id: string;
  userName: string;
  name: string;
};

export type TweetRef = {
  id: string;
  author: TwitterUser | null;
};

export type Tweet = {
  id: string;
  text: string;
  author: TwitterUser;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  likeCount: number;
  viewCount: number;
  createdAt: string;
  isReply?: boolean;
  conversationId?: string;
  inReplyToId?: string;
  inReplyToUserId?: string;
  inReplyToUsername?: string;
  userMentions: TweetMention[];
  quotedTweet: TweetRef | null;
  retweetedTweet: TweetRef | null;
};

function toArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v as Record<string, unknown>[] : [];
}

function inner(data: Record<string, unknown>): Record<string, unknown> {
  const d = data.data;
  if (d !== null && d !== undefined && !Array.isArray(d) && typeof d === "object") {
    return d as Record<string, unknown>;
  }
  return data;
}

function num(v: unknown): number { return (v as number) ?? 0; }

function toUser(raw: Record<string, unknown> | null | undefined): TwitterUser | null {
  if (!raw) return null;
  const id = (raw.id ?? raw.rest_id ?? "") as string;
  const userName = (raw.userName ?? raw.screen_name ?? "") as string;
  if (!id && !userName) return null;
  return {
    id,
    userName,
    name: (raw.name ?? userName ?? "") as string,
    profilePicture: (raw.profilePicture ?? raw.profile_image_url_https ?? "") as string,
    followers: num(raw.followers ?? raw.followers_count),
    isBlueVerified: Boolean(raw.isBlueVerified ?? false),
    isProtected: Boolean(raw.isProtected ?? raw.protected ?? false),
  };
}

function toTweetRef(raw: unknown): TweetRef | null {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    id: (obj.id ?? "") as string,
    author: toUser((obj.author ?? null) as Record<string, unknown> | null),
  };
}

function toMentions(raw: unknown): TweetMention[] {
  const entities = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const userMentions = entities && entities.user_mentions;
  return toArr(userMentions).map((mention) => ({
    id: (mention.id_str ?? mention.id ?? mention.user_id ?? "") as string,
    userName: (mention.screen_name ?? mention.userName ?? "") as string,
    name: (mention.name ?? mention.screen_name ?? mention.userName ?? "") as string,
  })).filter((mention) => mention.id || mention.userName);
}

function toTweet(raw: Record<string, unknown>): Tweet {
  return {
    id: raw.id as string,
    text: (raw.text ?? "") as string,
    author: (toUser((raw.author ?? null) as Record<string, unknown> | null) ?? {
      id: "",
      userName: "unknown",
      name: "unknown",
      profilePicture: "",
      followers: 0,
      isBlueVerified: false,
      isProtected: false,
    }),
    retweetCount: num(raw.retweetCount),
    replyCount: num(raw.replyCount),
    quoteCount: num(raw.quoteCount),
    likeCount: num(raw.likeCount ?? raw.favorite_count),
    viewCount: num(raw.viewCount ?? raw.views ?? (raw.views as Record<string, unknown> | undefined)?.count),
    createdAt: (raw.createdAt ?? "") as string,
    isReply: Boolean(raw.isReply ?? false),
    conversationId: raw.conversationId as string | undefined,
    inReplyToId: raw.inReplyToId as string | undefined,
    inReplyToUserId: raw.inReplyToUserId as string | undefined,
    inReplyToUsername: raw.inReplyToUsername as string | undefined,
    userMentions: toMentions(raw.entities),
    quotedTweet: toTweetRef(raw.quoted_tweet),
    retweetedTweet: toTweetRef(raw.retweeted_tweet),
  };
}

export async function getUserInfo(username: string, apiKey: string, signal?: AbortSignal): Promise<TwitterUser> {
  if (mockMode) return mockGetUserInfo(username);
  const data = await apiFetch(`/twitter/user/info?userName=${encodeURIComponent(username)}`, apiKey, signal) as Record<string, unknown>;
  const user = toUser((data.data ?? data.user ?? data) as Record<string, unknown> | null);
  if (!user) throw new Error(`未找到用户 @${username}`);
  return user;
}

export async function getUserTweets(username: string, apiKey: string, limit = 75, signal?: AbortSignal): Promise<Tweet[]> {
  if (mockMode) return mockGetUserTweets(limit);
  const tweets: Tweet[] = [];
  let cursor = "";
  while (tweets.length < limit) {
    const url = `/twitter/user/last_tweets?userName=${encodeURIComponent(username)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = await apiFetch(url, apiKey, signal) as Record<string, unknown>;
    const src = inner(data);
    tweets.push(...toArr(src.tweets ?? src.data ?? src.timeline).map(toTweet));
    if (!data.has_next_page || !data.next_cursor || tweets.length >= limit) break;
    cursor = data.next_cursor as string;
  }
  return tweets.slice(0, limit);
}

export async function getTweetReplies(tweetId: string, apiKey: string, signal?: AbortSignal): Promise<Tweet[]> {
  try {
    if (mockMode) return mockGetReplies(tweetId);
    const replies: Tweet[] = [];
    let cursor = "";
    while (true) {
      const url = `/twitter/tweet/replies/v2?tweetId=${encodeURIComponent(tweetId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await apiFetch(url, apiKey, signal) as Record<string, unknown>;
      const src = inner(data);
      const batch = toArr(src.replies ?? src.tweets ?? src.data).map(toTweet).filter((t) => t.author.id || t.author.userName);
      replies.push(...batch);
      if (!data.has_next_page || !data.next_cursor || batch.length === 0) break;
      cursor = data.next_cursor as string;
    }
    return replies;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return [];
  }
}

export async function getTweetRetweets(tweetId: string, apiKey: string, signal?: AbortSignal): Promise<TwitterUser[]> {
  try {
    if (mockMode) return mockGetRetweets(tweetId);
    const data = await apiFetch(`/twitter/tweet/retweeters?tweetId=${encodeURIComponent(tweetId)}`, apiKey, signal) as Record<string, unknown>;
    const src = inner(data);
    return toArr(src.users ?? src.retweets ?? src.data).map((user) => toUser(user)).filter(Boolean) as TwitterUser[];
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return [];
  }
}

export async function getTweetQuotes(tweetId: string, apiKey: string, signal?: AbortSignal): Promise<Tweet[]> {
  try {
    if (mockMode) return mockGetQuotes(tweetId);
    const data = await apiFetch(`/twitter/tweet/quotes?tweetId=${encodeURIComponent(tweetId)}`, apiKey, signal) as Record<string, unknown>;
    const src = inner(data);
    return toArr(src.tweets ?? src.data).map(toTweet).filter((tweet) => tweet.author.id || tweet.author.userName);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return [];
  }
}

export async function getUserMentions(userId: string, apiKey: string, limit = 200, signal?: AbortSignal): Promise<Tweet[]> {
  try {
    if (mockMode) return mockGetMentions();
    const mentions: Tweet[] = [];
    let cursor = "";
    while (mentions.length < limit) {
      const url = `/twitter/user/mentionTimeline?userId=${encodeURIComponent(userId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await apiFetch(url, apiKey, signal) as Record<string, unknown>;
      const src = inner(data);
      const batch = toArr(src.tweets ?? src.data).map(toTweet);
      mentions.push(...batch);
      if (!data.has_next_page || !data.next_cursor || batch.length === 0) break;
      cursor = data.next_cursor as string;
    }
    return mentions.slice(0, limit);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return [];
  }
}

export async function getAdvancedSearch(query: string, apiKey: string, limit = 100, signal?: AbortSignal): Promise<Tweet[]> {
  try {
    if (mockMode) return [];
    const tweets: Tweet[] = [];
    let cursor = "";
    while (tweets.length < limit) {
      const url = `/twitter/tweet/advancedSearch?query=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await apiFetch(url, apiKey, signal) as Record<string, unknown>;
      const src = inner(data);
      const batch = toArr(src.tweets ?? src.data).map(toTweet).filter((t) => t.author.id || t.author.userName);
      tweets.push(...batch);
      if (!data.has_next_page || !data.next_cursor || batch.length === 0) break;
      cursor = data.next_cursor as string;
    }
    return tweets.slice(0, limit);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return [];
  }
}

export async function getTweetThreadContext(tweetId: string, apiKey: string, signal?: AbortSignal): Promise<Tweet[]> {
  try {
    if (mockMode) return mockGetThreadContext(tweetId);
    const data = await apiFetch(`/twitter/tweet/thread_context?tweetId=${encodeURIComponent(tweetId)}`, apiKey, signal) as Record<string, unknown>;
    const src = inner(data);
    return toArr(src.replies ?? src.tweets ?? src.data).map(toTweet).filter((tweet) => tweet.author.id || tweet.author.userName);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return [];
  }
}
