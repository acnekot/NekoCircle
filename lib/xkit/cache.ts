import type { FollowSignal, XKitPeerSignal } from "@/lib/affinity/types";

type CacheEntry<T> = { expiresAt: number; value: T };
const likeCache = new Map<string, CacheEntry<{ limit: number; values: XKitPeerSignal[] }>>();
const followCache = new Map<string, CacheEntry<{ following: FollowSignal[]; followers: FollowSignal[] }>>();

export function getCachedLikes(userId: string, limit: number, now = Date.now()): XKitPeerSignal[] | undefined {
  const entry = likeCache.get(userId);
  if (!entry || entry.expiresAt <= now || entry.value.limit < limit) return undefined;
  return entry.value.values;
}

export function setCachedLikes(userId: string, limit: number, values: XKitPeerSignal[], now = Date.now()): void {
  likeCache.set(userId, { expiresAt: now + 6 * 60 * 60 * 1000, value: { limit, values } });
}

export function getCachedFollows(userId: string, now = Date.now()): { following: FollowSignal[]; followers: FollowSignal[] } | undefined {
  const entry = followCache.get(userId);
  return entry && entry.expiresAt > now ? entry.value : undefined;
}

export function setCachedFollows(
  userId: string,
  value: { following: FollowSignal[]; followers: FollowSignal[] },
  now = Date.now(),
): void {
  followCache.set(userId, { expiresAt: now + 24 * 60 * 60 * 1000, value });
}

export function clearXKitCachesForTests(): void {
  likeCache.clear();
  followCache.clear();
}
