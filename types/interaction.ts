export type InteractionType = "reply" | "mention" | "quote" | "repost";

export type InteractionSource = "fxtwitter" | "yahoo" | "bing";

/** 与具体数据源无关的最小互动记录。 */
export type InteractionEvent = {
  tweetId: string;
  author: string;
  target: string;
  type: InteractionType;
  /** Unix 毫秒时间戳；旧数据源无法提供时可以省略。 */
  createdAt?: number;
  source: InteractionSource;
  /** 同一事件被多个数据源命中时保留全部来源。 */
  sources?: InteractionSource[];
};

/** 本轮仅启用 fast，deep 先作为后续扩展入口保留。 */
export type ScanMode = "fast" | "deep";
