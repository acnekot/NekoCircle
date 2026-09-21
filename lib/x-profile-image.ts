/** FixTweet（fxtwitter）と BetterTwitFix（vxtwitter）の User API を並列で使う */

const FX_USER_API = "https://api.fxtwitter.com";
const VX_USER_API = "https://api.vxtwitter.com";
const PROFILE_REQUEST_TIMEOUT_MS = 5_000;
const AVATAR_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const AVATAR_FAILURE_TTL_MS = 15 * 60 * 1000;

type AvatarCacheEntry = { value: string | null; expiresAt: number };
const avatarCache = new Map<string, AvatarCacheEntry>();
const avatarInflight = new Map<string, Promise<string | null>>();

type FxTwitterUserResponse = {
  code: number;
  message: string;
  user?: {
    avatar_url?: string;
    followers?: number;
    following?: number;
    tweets?: number;
    likes?: number;
    created_at?: string;
  };
};

type FxTwitterUser = NonNullable<FxTwitterUserResponse["user"]>;
type FxUserCacheEntry = { value: FxTwitterUser; expiresAt: number };
const fxUserCache = new Map<string, FxUserCacheEntry>();
const fxUserInflight = new Map<string, Promise<FxTwitterUser | null>>();

export type XProfileData = {
  followers: number;
  following: number;
  tweets: number;
  likes: number;
  joinedAt: string;
};

export function upscaledTwitterProfileImageUrl(url: string): string {
  const raw = url.trim();
  try {
    const u = new URL(raw);
    if (!u.hostname.endsWith("pbs.twimg.com") || !u.pathname.includes("/profile_images/")) {
      return raw;
    }
    let p = u.pathname;
    p = p
      .replace(/_normal(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_mini(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_bigger(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_reasonably_small(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_200x200(\.[a-z]+)$/i, "_400x400$1");
    u.pathname = p;
    return u.toString();
  } catch {
    return raw;
  }
}

/** 同一用户的头像与统计共用一次 FxTwitter Profile 请求。 */
async function fetchFxUser(cleanScreenName: string): Promise<FxTwitterUser | null> {
  const key = cleanScreenName.toLowerCase();
  const cached = fxUserCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const current = fxUserInflight.get(key);
  if (current) return current;

  const request = (async () => {
    try {
      const res = await fetch(`${FX_USER_API}/${encodeURIComponent(key)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as FxTwitterUserResponse;
      if (data.code !== 200 || !data.user) return null;
      fxUserCache.set(key, {
        value: data.user,
        expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
      });
      return data.user;
    } catch {
      return null;
    }
  })().finally(() => fxUserInflight.delete(key));
  fxUserInflight.set(key, request);
  return request;
}

async function fetchAvatarFxtwitter(cleanScreenName: string): Promise<string | null> {
  const user = await fetchFxUser(cleanScreenName);
  if (!user?.avatar_url?.trim()) return null;
  return upscaledTwitterProfileImageUrl(user.avatar_url.trim());
}

async function fetchAvatarVxtwitter(cleanScreenName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${VX_USER_API}/${encodeURIComponent(cleanScreenName)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { profile_image_url?: string };
    const raw = data.profile_image_url?.trim();
    if (!raw) return null;
    return upscaledTwitterProfileImageUrl(raw);
  } catch {
    return null;
  }
}

const AVATAR_RETRY_ATTEMPTS = 2;
const AVATAR_RETRY_BASE_DELAY_MS = 120;

async function fetchXAvatarUrlOnce(cleanScreenName: string): Promise<string | null> {
  // FxTwitter 命中时不再请求 VxTwitter，避免每个头像固定产生两次请求。
  const fromFx = await fetchAvatarFxtwitter(cleanScreenName);
  return fromFx ?? (await fetchAvatarVxtwitter(cleanScreenName));
}

export async function fetchXAvatarUrl(screenName: string): Promise<string | null> {
  const clean = screenName.replace(/^@/, "").trim().toLowerCase();
  if (!clean) return null;
  const cached = avatarCache.get(clean);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const current = avatarInflight.get(clean);
  if (current) return current;

  const request = (async () => {
    for (let attempt = 0; attempt < AVATAR_RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((r) =>
          setTimeout(r, AVATAR_RETRY_BASE_DELAY_MS * attempt),
        );
      }
      const url = await fetchXAvatarUrlOnce(clean);
      if (url?.trim()) {
        const value = url.trim();
        avatarCache.set(clean, {
          value,
          expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
        });
        return value;
      }
    }
    avatarCache.set(clean, {
      value: null,
      expiresAt: Date.now() + AVATAR_FAILURE_TTL_MS,
    });
    return null;
  })().finally(() => avatarInflight.delete(clean));
  avatarInflight.set(clean, request);
  return request;
}

export async function resolveCircleAvatarUrl(screenName: string): Promise<string | null> {
  return fetchXAvatarUrl(screenName);
}

/** アカウント価値などの補助表示に使う公開プロフィール統計を取得する。 */
export async function resolveProfileData(screenName: string): Promise<XProfileData | null> {
  const clean = screenName.replace(/^@/, "").trim().toLowerCase();
  if (!clean) return null;

  for (let attempt = 0; attempt < AVATAR_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) =>
        setTimeout(r, AVATAR_RETRY_BASE_DELAY_MS * attempt),
      );
    }
    try {
      const user = await fetchFxUser(clean);
      if (!user) continue;
      return {
        followers: user.followers ?? 0,
        following: user.following ?? 0,
        tweets: user.tweets ?? 0,
        likes: user.likes ?? 0,
        joinedAt: user.created_at ?? "",
      };
    } catch {
      // 一時的な API エラーは既存のアバター取得と同じ方針で再試行する。
    }
  }
  return null;
}
