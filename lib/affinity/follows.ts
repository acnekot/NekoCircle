import { normalizeUsername } from "@/lib/interactions/normalize";
import type { FollowSignal } from "./types";

export function buildFollowSignals(
  following: readonly FollowSignal[],
  followers: readonly FollowSignal[],
): FollowSignal[] {
  const map = new Map<string, FollowSignal>();
  for (const peer of following) {
    const screenName = normalizeUsername(peer.screenName);
    if (!screenName) continue;
    map.set(screenName, { ...peer, screenName, iFollow: true, followsMe: false });
  }
  for (const peer of followers) {
    const screenName = normalizeUsername(peer.screenName);
    if (!screenName) continue;
    const existing = map.get(screenName);
    map.set(screenName, {
      ...existing,
      ...peer,
      screenName,
      iFollow: Boolean(existing?.iFollow),
      followsMe: true,
      userId: peer.userId ?? existing?.userId,
      avatarUrl: peer.avatarUrl ?? existing?.avatarUrl,
    });
  }
  return [...map.values()].map((peer) => ({
    ...peer,
    mutualFollow: peer.iFollow && peer.followsMe,
  }));
}
