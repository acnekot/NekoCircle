import type { CircleUser, SelfProfile } from "@/types/circle";

// ── Types migrated from deleted lib/twitter.ts, lib/scoring.ts, lib/analyze.ts ──

export type TwitterUser = {
  id: string;
  userName: string;
  name: string;
  profilePicture: string;
  profilePictureFallbacks?: string[];
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

function avatarUrlCandidates(
  screenName: string,
  hdUrl?: string,
  previewUrl?: string,
): { primary: string; fallbacks: string[] } {
  const candidates = [...new Set([
    hdUrl?.trim(),
    previewUrl?.trim(),
    `/api/avatar?username=${encodeURIComponent(screenName.replace(/^@+/, ""))}`,
  ].filter((value): value is string => Boolean(value)))];
  return { primary: candidates[0]!, fallbacks: candidates.slice(1) };
}

/** Yahoo CircleUser[] → CircleChart 所需的 AnalysisResult */
export function yahooToAnalysisResult(
  self: SelfProfile,
  users: CircleUser[],
  counts: { toYou: number; fromYou: number },
): AnalysisResult {
  const orderedUsers = [...users].sort(
    (a, b) =>
      b.interactionScore - a.interactionScore ||
      (b.interactionCount ?? 0) - (a.interactionCount ?? 0) ||
      a.screenName.localeCompare(b.screenName),
  );
  const selfAvatar = avatarUrlCandidates(
    self.screenName,
    self.avatarUrl,
    self.avatarUrlPreview,
  );
  return {
    targetUser: {
      id: self.screenName,
      userName: self.screenName,
      name: self.displayName || self.screenName,
      profilePicture: selfAvatar.primary,
      profilePictureFallbacks: selfAvatar.fallbacks,
      followers: 0,
      isBlueVerified: false,
      isProtected: false,
    },
    topUsers: orderedUsers.map((u) => {
      const avatar = avatarUrlCandidates(u.screenName, u.avatarUrl, u.avatarUrlPreview);
      return {
        user: {
          id: u.screenName,
          userName: u.screenName,
          name: u.displayName || u.screenName,
          profilePicture: avatar.primary,
          profilePictureFallbacks: avatar.fallbacks,
          followers: 0,
          isBlueVerified: false,
          isProtected: false,
        },
        replies: 0,
        quotes: 0,
        retweets: 0,
        mentions: u.interactionCount ?? 0,
        outboundScore: (u.interactionCount ?? 0) / 2,
        inboundScore: (u.interactionCount ?? 0) / 2,
        score: u.interactionScore,
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
  self: SelfProfile;
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
    mentionTotal: counts.toYou + counts.fromYou,
    profileFollowers: data.profileFollowers,
    profileFollowing: data.profileFollowing,
    profileTweets: data.profileTweets,
    profileLikes: data.profileLikes,
    profileJoinedAt: data.profileJoinedAt,
  };
  return {
    analysisResult: yahooToAnalysisResult(self, circleUsers, counts),
    circleUsers,
    counts,
    self,
    selfAvatarUrl: data.selfAvatarUrl,
    selfAvatarUrlPreview: data.selfAvatarUrlPreview,
    screenName,
  };
}
