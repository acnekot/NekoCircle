import type { CircleUser, SelfProfile } from "@/types/circle";

export type AccountValueResult = {
  estimatedPriceYen: number;
  grade: "S" | "A" | "B" | "C" | "D";
  metrics: {
    followers: number;
    tweets: number;
    accountAgeDays: number;
    totalMentions: number;
    uniqueUsers: number;
    averageScore: number;
  };
};

function accountAgeDays(joinedAt?: string): number {
  if (!joinedAt) return 0;
  const joined = new Date(joinedAt).getTime();
  if (!Number.isFinite(joined)) return 0;
  return Math.max(1, Math.floor((Date.now() - joined) / 86_400_000));
}

/** 上流项目的娱乐性估值模型。结果只用于展示，不代表真实交易价格。 */
export function estimateAccountValue(
  users: CircleUser[],
  profile: SelfProfile,
): AccountValueResult {
  const uniqueUsers = users.length;
  const totalMentions =
    profile.mentionTotal ??
    users.reduce((sum, user) => sum + (user.interactionCount ?? 0), 0);
  const averageScore = uniqueUsers
    ? users.reduce((sum, user) => sum + user.interactionScore, 0) / uniqueUsers
    : 0;
  const followers = profile.profileFollowers ?? 0;
  const tweets = profile.profileTweets ?? 0;
  const ageDays = accountAgeDays(profile.profileJoinedAt);

  const followerRate = 0.5 + (averageScore / 100) * 1.5;
  const estimatedPriceYen = Math.max(
    0,
    Math.round(
      followers * followerRate +
        tweets * 0.1 +
        totalMentions * 3 +
        Math.min(50_000, ageDays * 5) +
        uniqueUsers * averageScore * 10,
    ),
  );

  const grade =
    estimatedPriceYen >= 1_000_000
      ? "S"
      : estimatedPriceYen >= 300_000
        ? "A"
        : estimatedPriceYen >= 100_000
          ? "B"
          : estimatedPriceYen >= 30_000
            ? "C"
            : "D";

  return {
    estimatedPriceYen,
    grade,
    metrics: {
      followers,
      tweets,
      accountAgeDays: ageDays,
      totalMentions,
      uniqueUsers,
      averageScore: Math.round(averageScore),
    },
  };
}
