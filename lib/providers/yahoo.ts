import type { InteractionEvent, ScanMode } from "@/types/interaction";
import type { YahooRealtimeEntry } from "@/types/yahoo-realtime";
import {
  buildYahooAuthorProfileImageMap,
  fetchMentionsBothParallel,
  pickSelfProfileImageFromYahoo,
} from "../yahoo-realtime-fetch";
import { normalizeUsername } from "../interactions/normalize";
import { normalizeInteractionText } from "../interactions/text";
import type { InteractionProvider } from "./types";

function usernameFromXUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value, "https://x.com");
    if (!/(^|\.)(?:x|twitter)\.com$/i.test(url.hostname)) return "";
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return normalizeUsername(first);
  } catch {
    return "";
  }
}

function yahooEntryAuthor(entry: YahooRealtimeEntry): string {
  return (
    normalizeUsername(entry.screenName ?? "") ||
    usernameFromXUrl(entry.userUrl) ||
    usernameFromXUrl(entry.url)
  );
}

function yahooReplyTargets(entry: YahooRealtimeEntry): string[] {
  return (entry.replyMentions ?? [])
    .map((mention) =>
      normalizeUsername(
        typeof mention === "string" ? mention : mention.screenName ?? "",
      ),
    )
    .filter(Boolean);
}

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
    const author = yahooEntryAuthor(entry);
    if (!entry.id || !author || author === self) continue;
    const isReply = yahooReplyTargets(entry).includes(self);
    const text = normalizeInteractionText(entry.displayTextBody ?? entry.displayText);
    events.push({
      tweetId: entry.id,
      author,
      target: self,
      type: isReply ? "reply" : "mention",
      ...(text ? { text } : {}),
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
    const text = normalizeInteractionText(entry.displayTextBody ?? entry.displayText);
    for (const target of targets) {
      events.push({
        tweetId: entry.id,
        author: self,
        target,
        type: "mention",
        ...(text ? { text } : {}),
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
