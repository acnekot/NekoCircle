import { TwitterClient, type TwitterUser } from "@brainwav/xkit";
import { buildFollowingFeatures, buildLikesFeatures } from "@brainwav/xkit/dist/lib/twitter-client-features.js";
import { TWITTER_API_BASE } from "@brainwav/xkit/dist/lib/twitter-client-constants.js";
import {
  extractCursorFromInstructions,
  parseTweetsFromInstructions,
  parseUsersFromInstructions,
} from "@brainwav/xkit/dist/lib/twitter-client-utils.js";
import { aggregateLikes } from "@/lib/affinity/likes";
import { buildFollowSignals } from "@/lib/affinity/follows";
import { mergeAffinitySignals } from "@/lib/affinity/merge";
import { normalizeUsername } from "@/lib/interactions/normalize";
import {
  getCachedFollows,
  getCachedLikes,
  setCachedFollows,
  setCachedLikes,
} from "./cache";
import type { FollowSignal, LikeSignal, XKitAffinityData, XKitScanDepth } from "@/lib/affinity/types";

const LIKE_LIMITS: Record<XKitScanDepth, number> = { fast: 300, normal: 1000, deep: 3000 };
const PAGE_SIZE = 20;
const MAX_FOLLOW_PAGES = 100;
const REQUEST_TIMEOUT_MS = 15_000;

type SafeStatus = "unavailable" | "ok" | "partial";
export type XKitResult = {
  status: SafeStatus;
  reason?: "not_configured" | "auth_failed" | "account_mismatch" | "rate_limited" | "request_failed";
  data?: XKitAffinityData;
  elapsedMs: number;
};

type RawInstructions = Array<Record<string, unknown>>;
type PageFailure = "rate_limited" | "request_failed";
type XKitInternal = {
  getLikesQueryIds(): Promise<string[]>;
  getFollowingQueryIds(): Promise<string[]>;
  getFollowersQueryIds(): Promise<string[]>;
  getHeaders(): Record<string, string>;
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  refreshQueryIds(): Promise<void>;
  quoteDepth: number;
};

function scanDepth(): XKitScanDepth {
  const value = process.env.XKIT_SCAN_DEPTH?.trim().toLowerCase();
  return value === "normal" || value === "deep" ? value : "fast";
}

function clientFromEnvironment(): TwitterClient | undefined {
  const authToken = process.env.XKIT_AUTH_TOKEN?.trim();
  const ct0 = process.env.XKIT_CT0?.trim();
  if (!authToken || !ct0) return undefined;
  return new TwitterClient({ cookies: { authToken, ct0, cookieHeader: null, source: null }, timeoutMs: REQUEST_TIMEOUT_MS });
}

function internal(client: TwitterClient): XKitInternal {
  return client as unknown as XKitInternal;
}

function createdAtMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function stringAt(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function profileImageFromTweet(tweet: { _raw?: unknown }): string | undefined {
  const raw = tweet._raw;
  const paths = [
    ["core", "user_results", "result", "legacy", "profile_image_url_https"],
    ["core", "user_results", "result", "avatar"],
    ["legacy", "user_results", "result", "legacy", "profile_image_url_https"],
  ];
  for (const path of paths) {
    const value = stringAt(raw, path);
    if (value) return value.replace("_normal", "_400x400");
  }
  return undefined;
}

function toLike(tweet: { id: string; author: { username: string }; authorId?: string; createdAt?: string; _raw?: unknown }): LikeSignal | undefined {
  const targetScreenName = normalizeUsername(tweet.author?.username ?? "");
  if (!targetScreenName || !tweet.id) return undefined;
  return {
    tweetId: tweet.id,
    targetScreenName,
    targetUserId: tweet.authorId,
    createdAt: createdAtMs(tweet.createdAt),
    avatarUrl: profileImageFromTweet(tweet),
  };
}

function toFollow(user: TwitterUser): FollowSignal | undefined {
  const screenName = normalizeUsername(user.username ?? "");
  if (!screenName || !user.id) return undefined;
  return { userId: user.id, screenName, iFollow: false, followsMe: false, avatarUrl: user.profileImageUrl };
}

function safeReason(error: unknown): "rate_limited" | "request_failed" {
  if (error && typeof error === "object" && "xkitFailure" in error) {
    const kind = (error as { xkitFailure?: unknown }).xkitFailure;
    if (kind === "rate_limited") return "rate_limited";
  }
  return "request_failed";
}

function pageFailure(reason: PageFailure): Error {
  const error = new Error("xKit request did not complete") as Error & { xkitFailure: PageFailure };
  error.xkitFailure = reason;
  return error;
}

async function fetchLikesPaged(client: TwitterClient, accountId: string, limit: number): Promise<LikeSignal[]> {
  const api = internal(client);
  const tweets: LikeSignal[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  while (tweets.length < limit) {
    const count = Math.min(PAGE_SIZE, limit - tweets.length);
    const variables = {
      userId: accountId,
      count,
      includePromotedContent: false,
      withClientEventToken: false,
      withBirdwatchNotes: false,
      withVoice: true,
      ...(cursor ? { cursor } : {}),
    };
    const params = new URLSearchParams({ variables: JSON.stringify(variables) });
    // The features builder and query-id lookup are xKit internals. Keep this adapter
    // version-pinned and tested; the public getLikes() API in 0.6.0 is one page only.
    params.set("features", JSON.stringify(buildLikesFeatures()));
    const attempts = async () => {
      let had404 = false;
      let lastStatus = 0;
      let instructions: RawInstructions | undefined;
      for (const queryId of await api.getLikesQueryIds()) {
        const url = `${TWITTER_API_BASE}/${queryId}/Likes?${params.toString()}`;
        const response = await api.fetchWithTimeout(url, { method: "GET", headers: api.getHeaders() });
        lastStatus = response.status;
        if (response.status === 404) { had404 = true; continue; }
        if (response.status === 429) throw pageFailure("rate_limited");
        if (!response.ok) throw pageFailure("request_failed");
        const body = await response.json() as { data?: { user?: { result?: { timeline?: { timeline?: { instructions?: RawInstructions } } } } }; errors?: unknown[] };
        instructions = body.data?.user?.result?.timeline?.timeline?.instructions;
        if (!instructions || body.errors?.length) throw pageFailure("request_failed");
        return { instructions, had404, lastStatus };
      }
      return { instructions, had404, lastStatus };
    };
    let page = await attempts();
    if (!page.instructions && page.had404) {
      await api.refreshQueryIds();
      page = await attempts();
    }
    if (!page.instructions) throw pageFailure(page.lastStatus === 429 ? "rate_limited" : "request_failed");
    const parsed = parseTweetsFromInstructions(page.instructions, { quoteDepth: api.quoteDepth, includeRaw: true });
    for (const tweet of parsed) {
      if (seen.has(tweet.id)) continue;
      seen.add(tweet.id);
      const like = toLike(tweet);
      if (like) tweets.push(like);
      if (tweets.length >= limit) break;
    }
    const nextCursor = extractCursorFromInstructions(page.instructions);
    if (!nextCursor || nextCursor === cursor || parsed.length === 0) break;
    cursor = nextCursor;
  }
  return tweets;
}

async function fetchFollowPages(
  client: TwitterClient,
  accountId: string,
  direction: "Following" | "Followers",
): Promise<FollowSignal[]> {
  const api = internal(client);
  const users: FollowSignal[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let refreshed = false;
  for (let pageNumber = 0; pageNumber < MAX_FOLLOW_PAGES; pageNumber++) {
    const variables = { userId: accountId, count: PAGE_SIZE, includePromotedContent: false, ...(cursor ? { cursor } : {}) };
    const params = new URLSearchParams({ variables: JSON.stringify(variables), features: JSON.stringify(buildFollowingFeatures()) });
    const getIds = direction === "Following" ? api.getFollowingQueryIds : api.getFollowersQueryIds;
    let instructions: RawInstructions | undefined;
    let had404 = false;
    let lastStatus = 0;
    const requestPage = async () => {
      for (const queryId of await getIds.call(client)) {
        const response = await api.fetchWithTimeout(`${TWITTER_API_BASE}/${queryId}/${direction}?${params.toString()}`, {
          method: "GET",
          headers: api.getHeaders(),
        });
        lastStatus = response.status;
        if (response.status === 404) { had404 = true; continue; }
        if (response.status === 429) throw pageFailure("rate_limited");
        if (!response.ok) throw pageFailure("request_failed");
        const body = await response.json() as { data?: { user?: { result?: { timeline?: { timeline?: { instructions?: RawInstructions } } } } }; errors?: unknown[] };
        instructions = body.data?.user?.result?.timeline?.timeline?.instructions;
        if (!instructions || body.errors?.length) throw pageFailure("request_failed");
        return;
      }
    };
    await requestPage();
    if (!instructions && had404 && !refreshed) {
      refreshed = true;
      await api.refreshQueryIds();
      had404 = false;
      await requestPage();
    }
    if (!instructions) throw pageFailure(lastStatus === 429 ? "rate_limited" : "request_failed");
    for (const user of parseUsersFromInstructions(instructions)) {
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      const signal = toFollow(user);
      if (signal) users.push(signal);
    }
    const nextCursor = extractCursorFromInstructions(instructions);
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  if (cursor) throw pageFailure("request_failed");
  return users;
}

export async function fetchXKitAffinity(
  screenName: string,
  now = Date.now(),
): Promise<XKitResult> {
  const startedAt = Date.now();
  try {
    const client = clientFromEnvironment();
    if (!client) return { status: "unavailable", reason: "not_configured", elapsedMs: Date.now() - startedAt };
    const identity = await client.getCurrentUser();
    if (!identity.success || !identity.user?.id || !identity.user.username) {
      return { status: "unavailable", reason: "auth_failed", elapsedMs: Date.now() - startedAt };
    }
    if (normalizeUsername(identity.user.username) !== normalizeUsername(screenName)) {
      return { status: "unavailable", reason: "account_mismatch", elapsedMs: Date.now() - startedAt };
    }

    const accountId = identity.user.id;
    const depth = scanDepth();
    const requestedLikes = LIKE_LIMITS[depth];
    let likesByUser = getCachedLikes(accountId, requestedLikes, now);
    let following: FollowSignal[] = [];
    let followers: FollowSignal[] = [];
    let status: SafeStatus = "ok";
    let reason: XKitResult["reason"];
    const images: Record<string, string> = {};
    if (!likesByUser) {
      const likes = await fetchLikesPaged(client, accountId, requestedLikes);
      likesByUser = aggregateLikes(likes, now);
      setCachedLikes(accountId, requestedLikes, likesByUser, now);
    }
    for (const peer of likesByUser) if (peer.avatarUrl) images[peer.screenName] ??= peer.avatarUrl;

    const cachedFollows = getCachedFollows(accountId, now);
    if (cachedFollows) {
      following = cachedFollows.following;
      followers = cachedFollows.followers;
    } else {
      try {
        following = await fetchFollowPages(client, accountId, "Following");
        for (const peer of following) if (peer.avatarUrl) images[peer.screenName] ??= peer.avatarUrl;
        followers = await fetchFollowPages(client, accountId, "Followers");
        for (const peer of followers) if (peer.avatarUrl) images[peer.screenName] ??= peer.avatarUrl;
        setCachedFollows(accountId, { following, followers }, now);
      } catch (error) {
        status = "partial";
        reason = safeReason(error);
      }
    }
    const follows = buildFollowSignals(following, followers);
    const peers = mergeAffinitySignals(likesByUser, follows);
    for (const peer of peers) if (peer.avatarUrl) images[peer.screenName] ??= peer.avatarUrl;
    return {
      status,
      ...(reason ? { reason } : {}),
      elapsedMs: Date.now() - startedAt,
      data: { accountId, accountName: normalizeUsername(identity.user.username), peers, profileImages: images, scannedLikes: likesByUser.reduce((sum, peer) => sum + peer.likeCount, 0) },
    };
  } catch (error) {
    return { status: "unavailable", reason: safeReason(error), elapsedMs: Date.now() - startedAt };
  }
}
