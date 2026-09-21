import type { BingMentionEntry } from "@/types/bing-search";
import type { InteractionEvent } from "@/types/interaction";
import { fetchBingMentionsSafe } from "../bing-fetch";
import { normalizeUsername } from "../interactions/normalize";
import type { InteractionProvider } from "./types";

export function bingEntriesToInteractionEvents(
  entries: readonly BingMentionEntry[],
  selfScreenName: string,
): InteractionEvent[] {
  const self = normalizeUsername(selfScreenName);
  return entries.flatMap((entry) => {
    const author = normalizeUsername(entry.screenName);
    if (!entry.tweetId || !author || author === self) return [];
    return [
      {
        tweetId: entry.tweetId,
        author,
        target: self,
        type: "mention" as const,
        source: "bing" as const,
      },
    ];
  });
}

export const bingProvider: InteractionProvider = {
  name: "bing",
  async fetchInteractions(screenName) {
    return bingEntriesToInteractionEvents(
      await fetchBingMentionsSafe(screenName),
      screenName,
    );
  },
};
