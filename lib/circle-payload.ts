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
    screenName: name,
    counts: {
      mentionsToYou: incoming.length,
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
  };

  if (buildCircle) {
    const avatarStartedAt = Date.now();
    const previewImages = {
      ...(yahoo?.peerProfileImages ?? {}),
      ...(fx?.peerProfileImages ?? {}),
    };
    const [circleUsers, selfHd, profileData] = await Promise.all([
      interactionScoresToCircleUsers(scores, previewImages, 50),
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
      "yahoo-mentions-v3",
      name.toLowerCase(),
      buildCircle ? "circle" : "counts",
    ],
    // TTL は設定から読む。値はキャッシュキーに含めないので、変更は次に
    // キャッシュが切れた時点から効く（即時反映ではない）。
    { revalidate: ttl },
  )();
}
