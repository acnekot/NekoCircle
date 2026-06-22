export type BingMentionEntry = {
  /** ツイート ID（X / Twitter URL から抽出） */
  tweetId: string;
  /** 投稿者の screenName（@ なし、URL から抽出） */
  screenName: string;
  /** 元の検索結果リンク（正規化後） */
  url: string;
  /** Bing 検索結果のスニペット（任意） */
  snippet?: string;
};

export type BingSearchPage = {
  entries: BingMentionEntry[];
  /** Bing が「次のページなし」を示した場合 false */
  hasMore: boolean;
};

/** マージ後のツイート単位レコード（重複排除済み） */
export type MergedMentionTweet = {
  tweetId: string;
  screenName: string;
  sources: ReadonlyArray<"yahoo" | "bing">;
};

export type MentionSource = "yahoo" | "bing" | "both";

export type AuthorAggregate = {
  count: number;
  source: MentionSource;
};
