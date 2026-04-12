import type { CircleUser } from "@/types/circle";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";

const AVATAR_FETCH_CONCURRENCY = 14;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function yahooAggregatesToCircleUsers(
  authorsToYou: Record<string, number>,
  targetsFromYou: Record<string, number>,
  selfScreenName: string,
  yahooPeerProfileByScreen: Record<string, string>,
): Promise<CircleUser[]> {
  const self = selfScreenName.toLowerCase();
  const keys = new Set([
    ...Object.keys(authorsToYou),
    ...Object.keys(targetsFromYou),
  ]);

  const rows: { screen: string; n: number }[] = [];
  for (const k of keys) {
    if (k.toLowerCase() === self) continue;
    const n = (authorsToYou[k] ?? 0) + (targetsFromYou[k] ?? 0);
    if (n > 0) rows.push({ screen: k, n });
  }

  rows.sort((a, b) => b.n - a.n);
  const max = rows[0]?.n ?? 1;

  const list = await mapWithConcurrency(
    rows,
    AVATAR_FETCH_CONCURRENCY,
    async (r, i) => {
      const preview =
        yahooPeerProfileByScreen[r.screen.toLowerCase()]?.trim() || undefined;
      const hdRaw = await resolveCircleAvatarUrl(r.screen);
      const avatarUrl = hdRaw?.trim() || undefined;
      return {
        id: `yahoo-${r.screen}-${i}`,
        screenName: r.screen,
        displayName: r.screen,
        avatarUrlPreview: preview,
        avatarUrl,
        interactionScore: Math.max(1, Math.round((r.n / max) * 100)),
        interactionCount: r.n,
      };
    },
  );
  return list.filter((u) =>
    Boolean(u.avatarUrl?.trim() || u.avatarUrlPreview?.trim()),
  );
}
