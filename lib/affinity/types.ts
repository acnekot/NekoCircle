export type LikeSignal = {
  tweetId: string;
  targetUserId?: string;
  targetScreenName: string;
  createdAt?: number;
  avatarUrl?: string;
};

export type FollowSignal = {
  userId?: string;
  screenName: string;
  iFollow: boolean;
  followsMe: boolean;
  mutualFollow?: boolean;
  avatarUrl?: string;
};

export type XKitPeerSignal = {
  userId?: string;
  screenName: string;
  likeCount: number;
  weightedLikeCount: number;
  likeActiveDays: number;
  lastLikedAt?: number;
  iFollow: boolean;
  followsMe: boolean;
  mutualFollow: boolean;
  avatarUrl?: string;
};

export type XKitScanDepth = "fast" | "normal" | "deep";

export type XKitAffinityData = {
  accountId: string;
  accountName: string;
  peers: XKitPeerSignal[];
  profileImages: Record<string, string>;
  scannedLikes: number;
};
