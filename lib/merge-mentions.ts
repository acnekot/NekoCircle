import type { YahooRealtimeEntry } from "@/types/yahoo-realtime";
import type {
  AuthorAggregate,
  BingMentionEntry,
  MentionSource,
  MergedMentionTweet,
} from "@/types/bing-search";

/**
 * Yahoo / Bing から取得したツイートを tweetId で重複排除し、
 * 各ツイートの出所（yahoo / bing / 両方）を保持した配列に統合する。
 */
export function mergeMentionTweets(
  yahooEntries: YahooRealtimeEntry[],
  bingEntries: BingMentionEntry[],
): MergedMentionTweet[] {
  const map = new Map<string, { screenName: string; sources: Set<"yahoo" | "bing"> }>();

  for (const e of yahooEntries) {
    const id = e.id?.trim();
    const sn = (e.screenName ?? "").trim().toLowerCase();
    if (!id || !sn) continue;
    const cur = map.get(id);
    if (cur) {
      cur.sources.add("yahoo");
    } else {
      map.set(id, { screenName: sn, sources: new Set(["yahoo"]) });
    }
  }

  for (const e of bingEntries) {
    const id = e.tweetId?.trim();
    const sn = (e.screenName ?? "").trim().toLowerCase();
    if (!id || !sn) continue;
    const cur = map.get(id);
    if (cur) {
      cur.sources.add("bing");
      // Yahoo 側に screenName 欠損があった場合、Bing で補完される
      if (!cur.screenName) cur.screenName = sn;
    } else {
      map.set(id, { screenName: sn, sources: new Set(["bing"]) });
    }
  }

  const out: MergedMentionTweet[] = [];
  for (const [tweetId, v] of map) {
    out.push({
      tweetId,
      screenName: v.screenName,
      sources: [...v.sources],
    });
  }
  return out;
}

function sourcesToTag(sources: ReadonlyArray<"yahoo" | "bing">): MentionSource {
  const hasY = sources.includes("yahoo");
  const hasB = sources.includes("bing");
  if (hasY && hasB) return "both";
  if (hasB) return "bing";
  return "yahoo";
}

/**
 * tweetId 重複排除済みのレコード群から、screenName 別の集計と
 * source 属性を生成する。
 * - 自分自身（selfScreenName）は除外。
 */
export function aggregateMergedAuthors(
  merged: MergedMentionTweet[],
  selfScreenName: string,
): Record<string, AuthorAggregate> {
  const self = selfScreenName.replace(/^@+/, "").toLowerCase();
  const agg = new Map<string, { count: number; sources: Set<"yahoo" | "bing"> }>();

  for (const t of merged) {
    const sn = t.screenName.toLowerCase();
    if (!sn || sn === self) continue;
    const cur = agg.get(sn);
    if (cur) {
      cur.count += 1;
      for (const s of t.sources) cur.sources.add(s);
    } else {
      agg.set(sn, { count: 1, sources: new Set(t.sources) });
    }
  }

  const out: Record<string, AuthorAggregate> = {};
  for (const [sn, v] of agg) {
    out[sn] = { count: v.count, source: sourcesToTag([...v.sources]) };
  }
  return out;
}

/**
 * `yahooAggregatesToCircleUsers` が受け取る Record<string, number> 形に
 * 落とすユーティリティ（既存変換関数を変えずに使うため）。
 */
export function authorAggregateToCountMap(
  agg: Record<string, AuthorAggregate>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(agg)) out[k] = v.count;
  return out;
}

/** screenName -> source の薄いマップ（CircleUser に source 属性を後付けするため） */
export function authorSourceMap(
  agg: Record<string, AuthorAggregate>,
): Record<string, MentionSource> {
  const out: Record<string, MentionSource> = {};
  for (const [k, v] of Object.entries(agg)) out[k] = v.source;
  return out;
}
