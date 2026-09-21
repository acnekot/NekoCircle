import type { CircleUser } from "@/types/circle";

const KEY_PREFIX = "nekocircle-yahoo-v3:";
const TTL_MS = 8 * 60 * 1000;

export type YahooCircleClientCache = {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  profileFollowers?: number;
  profileFollowing?: number;
  profileTweets?: number;
  profileLikes?: number;
  profileJoinedAt?: string;
  circleId?: string;
  createdAt?: number;
  storageConsent?: boolean;
  retentionMode?: "long_term" | "temporary";
};

export function readYahooCircleCache(
  screenName: string,
  storageConsent: boolean,
): YahooCircleClientCache | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(
      `${KEY_PREFIX}${storageConsent ? "long" : "temp"}:${screenName.toLowerCase()}`,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      t: number;
      data: YahooCircleClientCache;
    };
    if (Date.now() - parsed.t > TTL_MS) {
      sessionStorage.removeItem(
        `${KEY_PREFIX}${storageConsent ? "long" : "temp"}:${screenName.toLowerCase()}`,
      );
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeYahooCircleCache(
  screenName: string,
  storageConsent: boolean,
  data: YahooCircleClientCache,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${KEY_PREFIX}${storageConsent ? "long" : "temp"}:${screenName.toLowerCase()}`,
      JSON.stringify({ t: Date.now(), data }),
    );
  } catch {
    /* 容量超過などは無視 */
  }
}
