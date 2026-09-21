/** Yahoo リアルタイム検索 API（pagination）の entry サブセット */
export type YahooRealtimeEntry = {
  id: string;
  displayText?: string;
  displayTextBody?: string;
  createdAt?: number;
  screenName?: string;
  name?: string;
  profileImage?: string;
  mentions?: { screenName?: string; indices?: number[] }[];
  replyMentions?: Array<
    | string
    | { screenName?: string; indices?: number[] }
  >;
  inReplyTo?: string;
  userUrl?: string;
  url?: string;
};

export type YahooPaginationResponse = {
  timeline?: {
    head?: {
      totalResultsAvailable?: number;
      totalResultsReturned?: number;
      oldestTweetId?: string;
    };
    entry?: YahooRealtimeEntry[];
  };
};
