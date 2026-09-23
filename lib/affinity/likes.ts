import { normalizeUsername } from "@/lib/interactions/normalize";
import type { LikeSignal, XKitPeerSignal } from "./types";

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 30;

export function likeTimeWeight(createdAt: number | undefined, now = Date.now()): number {
  if (createdAt === undefined || !Number.isFinite(createdAt)) return 1;
  const timestamp = createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt;
  const daysAgo = Math.max(0, now - timestamp) / DAY_MS;
  return Math.exp((-Math.LN2 * daysAgo) / HALF_LIFE_DAYS);
}

export function aggregateLikes(
  likes: readonly LikeSignal[],
  now = Date.now(),
): XKitPeerSignal[] {
  const byUser = new Map<string, XKitPeerSignal & { activeDates: Set<string> }>();
  for (const like of likes) {
    const screenName = normalizeUsername(like.targetScreenName);
    if (!screenName || !like.tweetId) continue;
    const peer = byUser.get(screenName) ?? {
      userId: like.targetUserId,
      screenName,
      likeCount: 0,
      weightedLikeCount: 0,
      likeActiveDays: 0,
      iFollow: false,
      followsMe: false,
      mutualFollow: false,
      avatarUrl: like.avatarUrl,
      activeDates: new Set<string>(),
    };
    peer.likeCount += 1;
    peer.weightedLikeCount += likeTimeWeight(like.createdAt, now);
    if (like.createdAt !== undefined && Number.isFinite(like.createdAt)) {
      const timestamp = like.createdAt < 1_000_000_000_000 ? like.createdAt * 1000 : like.createdAt;
      peer.activeDates.add(new Date(timestamp).toISOString().slice(0, 10));
      peer.lastLikedAt = Math.max(peer.lastLikedAt ?? 0, timestamp);
    }
    peer.userId ??= like.targetUserId;
    peer.avatarUrl ??= like.avatarUrl;
    byUser.set(screenName, peer);
  }
  return [...byUser.values()].map(({ activeDates, ...peer }) => ({
    ...peer,
    likeActiveDays: activeDates.size,
  }));
}
