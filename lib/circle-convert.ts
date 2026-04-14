import type { CircleUser, SelfProfile } from "@/types/circle";

// ── Types migrated from deleted lib/twitter.ts, lib/scoring.ts, lib/analyze.ts ──

export type TwitterUser = {
  id: string;
  userName: string;
  name: string;
  profilePicture: string;
  followers: number;
  isBlueVerified: boolean;
  isProtected: boolean;
};

export type ScoringWeights = {
  replyByMe: number;
  repliedByHim: number;
  quoteByMe: number;
  quotedByHim: number;
  rtByMe: number;
  rtedByHim: number;
  mentionByMe: number;
  mentionedByHim: number;
  decayLambda: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  replyByMe: 100,
  repliedByHim: 40,
  quoteByMe: 25,
  quotedByHim: 18,
  rtByMe: 15,
  rtedByHim: 10,
  mentionByMe: 8,
  mentionedByHim: 5,
  decayLambda: 0.05,
};

export type InteractionUser = {
  user: TwitterUser;
  replies: number;
  quotes: number;
  retweets: number;
  mentions: number;
  outboundScore: number;
  inboundScore: number;
  score: number;
};

export type AnalysisResult = {
  targetUser: TwitterUser;
  topUsers: InteractionUser[];
  tweetCount: number;
  analyzedAt: string;
  weights: ScoringWeights;
};

/** Yahoo CircleUser[] → CircleChart 所需的 AnalysisResult */
export function yahooToAnalysisResult(
  self: SelfProfile,
  users: CircleUser[],
  counts: { toYou: number; fromYou: number },
): AnalysisResult {
  return {
    targetUser: {
      id: self.screenName,
      userName: self.screenName,
      name: self.displayName || self.screenName,
      profilePicture: self.avatarUrl ?? self.avatarUrlPreview ?? "",
      followers: 0,
      isBlueVerified: false,
      isProtected: false,
    },
    topUsers: users.map((u) => {
      const count = u.interactionCount ?? u.interactionScore;
      return {
        user: {
          id: u.screenName,
          userName: u.screenName,
          name: u.displayName || u.screenName,
          profilePicture: u.avatarUrl ?? u.avatarUrlPreview ?? "",
          followers: 0,
          isBlueVerified: false,
          isProtected: false,
        },
        replies: 0,
        quotes: 0,
        retweets: 0,
        mentions: count,
        outboundScore: count / 2,
        inboundScore: count / 2,
        score: count,
      };
    }),
    tweetCount: counts.toYou + counts.fromYou,
    analyzedAt: new Date().toISOString(),
    weights: DEFAULT_SCORING_WEIGHTS,
  };
}

/** 从 Yahoo 持久化的 circle_data JSON 重建 AnalysisResult */
export function parseYahooCircleData(dataStr: string): {
  analysisResult: AnalysisResult;
  circleUsers: CircleUser[];
  counts: { toYou: number; fromYou: number };
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  screenName: string;
} {
  const data = JSON.parse(dataStr);
  const circleUsers: CircleUser[] = data.circleUsers ?? [];
  const counts = {
    toYou: data.counts?.mentionsToYou ?? 0,
    fromYou: data.counts?.mentionsFromYou ?? 0,
  };
  const screenName: string = data.screenName ?? "";
  const self: SelfProfile = {
    screenName,
    displayName: screenName,
    avatarUrl: data.selfAvatarUrl,
    avatarUrlPreview: data.selfAvatarUrlPreview,
  };
  return {
    analysisResult: yahooToAnalysisResult(self, circleUsers, counts),
    circleUsers,
    counts,
    selfAvatarUrl: data.selfAvatarUrl,
    selfAvatarUrlPreview: data.selfAvatarUrlPreview,
    screenName,
  };
}
