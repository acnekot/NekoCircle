export type InteractionType = "reply" | "mention" | "quote" | "repost";

export type InteractionSource = "fxtwitter" | "yahoo" | "bing";

/** 与具体数据源无关的最小互动记录。 */
export type InteractionEvent = {
  tweetId: string;
  author: string;
  target: string;
  type: InteractionType;
  /** 公开正文的短摘要；进入持久化载荷前已清理并截断。 */
  text?: string;
  /** Unix 毫秒时间戳；旧数据源无法提供时可以省略。 */
  createdAt?: number;
  source: InteractionSource;
  /** 同一事件被多个数据源命中时保留全部来源。 */
  sources?: InteractionSource[];
};

/** 本轮仅启用 fast，deep 先作为后续扩展入口保留。 */
export type ScanMode = "fast" | "deep";

export type InteractionProviderStatus = "ok" | "partial" | "failed" | "skipped";

export type InteractionDiagnosticEntry = {
  tweetId: string;
  author: string;
  target: string;
  type: InteractionType;
  text?: string;
  direction: "inbound" | "outbound";
  createdAt?: number;
  sources: InteractionSource[];
};

/** 可以安全展示给前台的抓取诊断；正文只保留清理、截断后的公开摘要。 */
export type InteractionDiagnostics = {
  dataVersion?: number;
  counts?: {
    mentionsToYou?: number;
    mentionsFromYou?: number;
    bingMentions?: number;
    mergedUniqueTweets?: number;
  };
  sourceStatus?: Partial<Record<InteractionSource, InteractionProviderStatus>>;
  stats?: {
    providers?: Partial<Record<InteractionSource, number>>;
    mergedEvents?: number;
    uniqueUsers?: number;
  };
  timings?: Partial<
    Record<InteractionSource | "merge" | "avatars" | "total", number>
  >;
  entries?: InteractionDiagnosticEntry[];
};
