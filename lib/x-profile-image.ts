/** FixTweet（fxtwitter）と BetterTwitFix（vxtwitter）の User API を並列で使う */

const FX_USER_API = "https://api.fxtwitter.com";
const VX_USER_API = "https://api.vxtwitter.com";

type FxTwitterUserResponse = {
  code: number;
  message: string;
  user?: { avatar_url?: string };
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

async function fetchAvatarFxtwitter(cleanScreenName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${FX_USER_API}/${encodeURIComponent(cleanScreenName)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as FxTwitterUserResponse;
    if (data.code !== 200 || !data.user?.avatar_url?.trim()) return null;
    return upscaledTwitterProfileImageUrl(data.user.avatar_url.trim());
  } catch {
    return null;
  }
}

async function fetchAvatarVxtwitter(cleanScreenName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${VX_USER_API}/${encodeURIComponent(cleanScreenName)}`,
      { headers: { Accept: "application/json" } },
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

const AVATAR_RETRY_ATTEMPTS = 3;
const AVATAR_RETRY_BASE_DELAY_MS = 120;

async function fetchXAvatarUrlOnce(cleanScreenName: string): Promise<string | null> {
  const [fromFx, fromVx] = await Promise.all([
    fetchAvatarFxtwitter(cleanScreenName),
    fetchAvatarVxtwitter(cleanScreenName),
  ]);
  return fromFx ?? fromVx ?? null;
}

export async function fetchXAvatarUrl(screenName: string): Promise<string | null> {
  const clean = screenName.replace(/^@/, "").trim();
  if (!clean) return null;
  for (let attempt = 0; attempt < AVATAR_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) =>
        setTimeout(r, AVATAR_RETRY_BASE_DELAY_MS * attempt),
      );
    }
    const url = await fetchXAvatarUrlOnce(clean);
    if (url?.trim()) return url.trim();
  }
  return null;
}

export async function resolveCircleAvatarUrl(screenName: string): Promise<string | null> {
  return fetchXAvatarUrl(screenName);
}
