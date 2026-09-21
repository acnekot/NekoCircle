import type { InteractionEvent, ScanMode } from "@/types/interaction";
import type { YahooRealtimeEntry } from "@/types/yahoo-realtime";
import {
  buildYahooAuthorProfileImageMap,
  fetchMentionsBothParallel,
  pickSelfProfileImageFromYahoo,
} from "../yahoo-realtime-fetch";
import { normalizeUsername } from "../interactions/normalize";
import type { InteractionProvider } from "./types";

function yahooTimestamp(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export function yahooEntriesToInteractionEvents(
  mentionsToYou: readonly YahooRealtimeEntry[],
  mentionsFromYou: readonly YahooRealtimeEntry[],
  selfScreenName: string,
): InteractionEvent[] {
  const self = normalizeUsername(selfScreenName);
  const events: InteractionEvent[] = [];

  for (const entry of mentionsToYou) {
    const author = normalizeUsername(entry.screenName ?? "");
    if (!entry.id || !author || author === self) continue;
    events.push({
      tweetId: entry.id,
      author,
      target: self,
      type: "mention",
      createdAt: yahooTimestamp(entry.createdAt),
      source: "yahoo",
    });
  }

  for (const entry of mentionsFromYou) {
    if (!entry.id) continue;
    const targets = new Set(
      (entry.mentions ?? [])
        .map((mention) => normalizeUsername(mention.screenName ?? ""))
        .filter((target) => target && target !== self),
    );
    for (const target of targets) {
      events.push({
        tweetId: entry.id,
        author: self,
        target,
        type: "mention",
        createdAt: yahooTimestamp(entry.createdAt),
        source: "yahoo",
      });
    }
  }
  return events;
}

export type YahooInteractionBundle = {
  events: InteractionEvent[];
  mentionsToYou: YahooRealtimeEntry[];
  mentionsFromYou: YahooRealtimeEntry[];
  peerProfileImages: Record<string, string>;
  selfProfileImage: string | null;
  failures: Array<"inbound" | "outbound">;
};

export async function fetchYahooInteractionBundle(
  screenName: string,
  mode: ScanMode = "fast",
): Promise<YahooInteractionBundle> {
  const result = await fetchMentionsBothParallel(screenName, { mode });
  return {
    events: yahooEntriesToInteractionEvents(
      result.mentionsToYou,
      result.mentionsFromYou,
      screenName,
    ),
    mentionsToYou: result.mentionsToYou,
    mentionsFromYou: result.mentionsFromYou,
    peerProfileImages: buildYahooAuthorProfileImageMap(result.mentionsToYou),
    selfProfileImage: pickSelfProfileImageFromYahoo(result.mentionsFromYou),
    failures: result.failures,
  };
}

export const yahooProvider: InteractionProvider = {
  name: "yahoo",
  async fetchInteractions(screenName) {
    return (await fetchYahooInteractionBundle(screenName)).events;
  },
};
