import { normalizeUsername } from "@/lib/interactions/normalize";
import type { FollowSignal, XKitPeerSignal } from "./types";

export function mergeAffinitySignals(
  likes: readonly XKitPeerSignal[],
  follows: readonly FollowSignal[],
): XKitPeerSignal[] {
  const map = new Map<string, XKitPeerSignal>();
  for (const peer of likes) map.set(normalizeUsername(peer.screenName), { ...peer });
  for (const follow of follows) {
    const screenName = normalizeUsername(follow.screenName);
    if (!screenName) continue;
    const existing = map.get(screenName);
    map.set(screenName, {
      userId: follow.userId ?? existing?.userId,
      screenName,
      likeCount: existing?.likeCount ?? 0,
      weightedLikeCount: existing?.weightedLikeCount ?? 0,
      likeActiveDays: existing?.likeActiveDays ?? 0,
      lastLikedAt: existing?.lastLikedAt,
      iFollow: follow.iFollow,
      followsMe: follow.followsMe,
      mutualFollow: follow.iFollow && follow.followsMe,
      avatarUrl: existing?.avatarUrl ?? follow.avatarUrl,
    });
  }
  return [...map.values()].filter((peer) =>
    peer.weightedLikeCount >= 1 || peer.mutualFollow,
  );
}
