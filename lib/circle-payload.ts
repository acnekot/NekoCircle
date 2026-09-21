import {
  unstable_cache,
} from "next/cache";
import {
  fetchBingMentionsSafe,
} from "@/lib/bing-fetch";
import {
  interactionScoresToCircleUsers,
} from "@/lib/yahoo-to-circle";
import {
  resolveCircleAvatarUrl,
  resolveProfileData,
} from "@/lib/x-profile-image";
import {
  getAppConfig,
} from "@/lib/app-config";
import {
  fetchFxTwitterInteractionBundle,
} from "@/lib/providers/fxtwitter";
import {
  fetchYahooInteractionBundle,
} from "@/lib/providers/yahoo";
import {
  bingEntriesToInteractionEvents,
} from "@/lib/providers/bing";
import {
  mergeInteractionEvents,
} from "@/lib/interactions/merge";
import {
  normalizeUsername,
} from "@/lib/interactions/normalize";
import {
  scoreInteractions,
} from "@/lib/interactions/scoring";
import type {
  InteractionEvent,
} from "@/types/interaction";

export const CIRCLE_PAYLOAD_VERSION = 8;

/**
 * 共有の取得パイプライン。
 * ページ（/api/yahoo-mentions）と OG 画像（/api/og/circle）が
 * 必ず同じ結果を返すよう、ロジックとキャッシュをここに集約する。
 */
export async function buildYahooPayload(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  const totalStartedAt = Date.now();
  const fxStartedAt = Date.now();
  const yahooStartedAt = Date.now();
  const [fxSettled, yahooSettled] = await Promise.allSettled([
    fetchFxTwitterInteractionBundle(name, "fast").then((value) => ({
      value,
      elapsed: Date.now() - fxStartedAt,
    })),
    fetchYahooInteractionBundle(name, "fast").then((value) => ({
      value,
      elapsed: Date.now() - yahooStartedAt,
    })),
  ]);

  const fx = fxSettled.status === "fulfilled" ? fxSettled.value.value : null;
  const yahoo =
    yahooSettled.status === "fulfilled" ? yahooSettled.value.value : null;
  const fxFailed = !fx || fx.failures.length === 2;
  const yahooFailed = !yahoo || yahoo.failures.length === 2;

  const mergeStartedAt = Date.now();
  let mergedEvents = mergeInteractionEvents([
    fx?.events ?? [],
    yahoo?.events ?? [],
  ]);
  let mergeElapsed = Date.now() - mergeStartedAt;
  let scores = scoreInteractions(mergedEvents, name);

  const uniqueMainTweets = new Set(mergedEvents.map((event) => event.tweetId)).size;
  const needsBing = uniqueMainTweets < 100 || scores.length < 15;
  let bingEvents: InteractionEvent[] = [];
  let bingStatus: "ok" | "failed" | "skipped" = "skipped";
  let bingElapsed = 0;
  if (needsBing) {
    const bingStartedAt = Date.now();
    try {
      const bingEntries = await fetchBingMentionsSafe(name);
      bingEvents = bingEntriesToInteractionEvents(bingEntries, name);
      bingStatus = "ok";
    } catch (error) {
      bingStatus = "failed";
      console.warn("[bing] fallback failed:", error);
    }
    bingElapsed = Date.now() - bingStartedAt;
    const secondMergeStartedAt = Date.now();
    mergedEvents = mergeInteractionEvents([mergedEvents, bingEvents]);
    mergeElapsed += Date.now() - secondMergeStartedAt;
    scores = scoreInteractions(mergedEvents, name);
  }

  if (fxFailed && yahooFailed && mergedEvents.length === 0) {
    throw new Error("all interaction providers failed");
  }

  const self = normalizeUsername(name);
  const incoming = mergedEvents.filter((event) => event.target === self);
  const outgoing = mergedEvents.filter((event) => event.author === self);
  // 入站数字表示「检测到多少条别人提及你的推文」，按 tweetId 去重。
  // 同一条回复可能被 Yahoo 识别为 mention、FxTwitter 识别为 reply；按事件数
  // 会重复计数。反过来，Yahoo 条目偶尔缺少作者字段时无法转成评分事件，仍应
  // 计入检测数字，避免明明搜到结果却显示 0。
  const incomingTweetIds = new Set(incoming.map((event) => event.tweetId));
  for (const entry of yahoo?.mentionsToYou ?? []) {
    if (!entry.id) continue;
    const author = normalizeUsername(entry.screenName ?? "");
    if (author && author === self) continue;
    incomingTweetIds.add(entry.id);
  }
  const authorsToYou: Record<string, number> = {};
  const targetsFromYou: Record<string, number> = {};
  const sourcesByScreen = new Map<string, Set<string>>();
  for (const event of mergedEvents) {
    const other = event.author === self ? event.target : event.author;
    const aggregate = event.target === self ? authorsToYou : targetsFromYou;
    aggregate[other] = (aggregate[other] ?? 0) + 1;
    const sources = sourcesByScreen.get(other) ?? new Set<string>();
    sources.add(event.source);
    for (const source of event.sources ?? []) sources.add(source);
    sourcesByScreen.set(other, sources);
  }
  const authorsSourceByScreen = Object.fromEntries(
    [...sourcesByScreen].map(([screenName, sources]) => [
      screenName,
      sources.size > 1 ? "mixed" : [...sources][0],
    ]),
  );

  const timings: Record<string, number> = {
    fxtwitter:
      fxSettled.status === "fulfilled"
        ? fxSettled.value.elapsed
        : Date.now() - fxStartedAt,
    yahoo:
      yahooSettled.status === "fulfilled"
        ? yahooSettled.value.elapsed
        : Date.now() - yahooStartedAt,
    bing: bingElapsed,
    merge: mergeElapsed,
  };

  const payload: Record<string, unknown> = {
    dataVersion: CIRCLE_PAYLOAD_VERSION,
    screenName: name,
    counts: {
      mentionsToYou: incomingTweetIds.size,
      mentionsFromYou: outgoing.length,
      bingMentions: bingEvents.length,
      mergedUniqueTweets: new Set(
        mergedEvents.map((event) => event.tweetId),
      ).size,
    },
    aggregates: {
      authorsToYou,
      targetsFromYou,
      authorsSourceByScreen,
    },
    sourceStatus: {
      fxtwitter: fxFailed ? "failed" : fx?.failures.length ? "partial" : "ok",
      yahoo: yahooFailed ? "failed" : yahoo?.failures.length ? "partial" : "ok",
      bing: bingStatus,
    },
    stats: {
      providers: {
        fxtwitter: fx?.events.length ?? 0,
        yahoo: yahoo?.events.length ?? 0,
        bing: bingEvents.length,
      },
      mergedEvents: mergedEvents.length,
      uniqueUsers: scores.length,
    },
    timings,
    entries: [...mergedEvents]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .map((event) => ({
        tweetId: event.tweetId,
        author: event.author,
        target: event.target,
        type: event.type,
        text: event.text,
        direction: event.target === self ? "inbound" : "outbound",
        createdAt: event.createdAt,
        sources: [...new Set([event.source, ...(event.sources ?? [])])],
      })),
  };

  if (buildCircle) {
    const avatarStartedAt = Date.now();
    const previewImages = {
      ...(yahoo?.peerProfileImages ?? {}),
      ...(fx?.peerProfileImages ?? {}),
    };
    const [circleUsers, selfHd, profileData] = await Promise.all([
      interactionScoresToCircleUsers(scores, previewImages),
      resolveCircleAvatarUrl(name),
      resolveProfileData(name),
    ]);
    timings.avatars = Date.now() - avatarStartedAt;
    payload.circleUsers = circleUsers;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    const selfPreview = fx?.selfProfileImage ?? yahoo?.selfProfileImage;
    if (selfPreview) payload.selfAvatarUrlPreview = selfPreview;
    if (profileData) {
      payload.profileFollowers = profileData.followers;
      payload.profileFollowing = profileData.following;
      payload.profileTweets = profileData.tweets;
      payload.profileLikes = profileData.likes;
      payload.profileJoinedAt = profileData.joinedAt;
    }
  }

  timings.total = Date.now() - totalStartedAt;

  return payload;
}

export function getCachedYahooPayload(name: string, buildCircle: boolean) {
  const ttl = getAppConfig().payloadCacheTtlSec;
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v8",
      name.toLowerCase(),
      buildCircle ? "circle" : "counts",
    ],
    // TTL は設定から読む。値はキャッシュキーに含めないので、変更は次に
    // キャッシュが切れた時点から効く（即時反映ではない）。
    { revalidate: ttl },
  )();
}
