import type { CircleUser } from "@/types/circle";
import {
  resolveCircleAvatarUrl,
  upscaledTwitterProfileImageUrl,
} from "@/lib/x-profile-image";
import type { InteractionScore } from "@/lib/interactions/scoring";

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

function sourceTag(
  sources: InteractionScore["sources"],
): NonNullable<CircleUser["source"]> {
  if (sources.length > 1) return "mixed";
  return sources[0] ?? "yahoo";
}

/** 排名完成后只为最终展示用户补充高清头像。 */
export async function interactionScoresToCircleUsers(
  scores: readonly InteractionScore[],
  profileImageByScreen: Record<string, string>,
  limit = 50,
): Promise<CircleUser[]> {
  const rows = scores.slice(0, limit);
  const max = rows[0]?.finalScore || 1;
  const list = await mapWithConcurrency(
    rows,
    Math.min(10, AVATAR_FETCH_CONCURRENCY),
    async (row, index): Promise<CircleUser> => {
      const preview =
        profileImageByScreen[row.screenName]?.trim() || undefined;
      // FxTwitter 的列表响应已经带有 pbs.twimg.com 头像。直接把尺寸后缀
      // 提升到 400x400，不再为每个候选用户额外请求一次 Profile API。
      // Yahoo preview 也先直接使用；只有完全没有预览图时才做外部补全。
      const derivedHd = preview
        ? upscaledTwitterProfileImageUrl(preview)
        : undefined;
      const hdRaw =
        derivedHd && derivedHd !== preview
          ? derivedHd
          : preview
            ? undefined
            : await resolveCircleAvatarUrl(row.screenName);
      return {
        id: `interaction-${row.screenName}-${index}`,
        screenName: row.screenName,
        displayName: row.screenName,
        avatarUrlPreview: preview,
        avatarUrl: hdRaw?.trim() || undefined,
        interactionScore: Math.max(
          1,
          Math.round((row.finalScore / max) * 100),
        ),
        interactionCount: row.interactionCount,
        source: sourceTag(row.sources),
      };
    },
  );
  return list.filter((user) =>
    Boolean(user.avatarUrl?.trim() || user.avatarUrlPreview?.trim()),
  );
}
