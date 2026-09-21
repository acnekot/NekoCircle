import type {
  InteractionEvent,
  InteractionType,
  ScanMode,
} from "@/types/interaction";
import { hasRankingConverged } from "../interactions/convergence";
import { mergeInteractionEvents } from "../interactions/merge";
import { normalizeUsername } from "../interactions/normalize";
import { normalizeInteractionText } from "../interactions/text";
import type { InteractionProvider } from "./types";

const FX_API = "https://api.fxtwitter.com/2";
const FX_TIMEOUT_MS = 12_000;
const PAGE_SIZE = 100;

type FxProfile = {
  screen_name?: string;
  avatar_url?: string;
};

type FxReplyTarget = {
  screen_name?: string;
};

type FxFacet = {
  type?: string;
  original?: string;
  replacement?: string;
  display?: string;
};

type FxStatus = {
  id?: string;
  author?: FxProfile;
  created_timestamp?: number;
  replying_to?: FxReplyTarget | null;
  quote?: { author?: FxProfile } | null;
  reposted_by?: FxProfile | null;
  text?: string;
  raw_text?: { text?: string; facets?: FxFacet[] };
};

type FxListResponse = {
  code?: number;
  message?: string;
  results?: FxStatus[];
  cursor?: { bottom?: string | null };
};

type FxDirection = "inbound" | "outbound";

function createdAt(status: FxStatus): number | undefined {
  const value = status.created_timestamp;
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function mentionTargets(status: FxStatus): string[] {
  const targets = new Set<string>();
  for (const facet of status.raw_text?.facets ?? []) {
    if (facet.type !== "mention") continue;
    const target = normalizeUsername(
      facet.original ?? facet.replacement ?? facet.display ?? "",
    );
    if (target) targets.add(target);
  }

  // 部分搜索响应会省略 facets，或只保留正文。正文中的显式 @ 是
  // 入站检测的重要兜底；用户名规则固定，因此不会吞入普通文本。
  const text = status.raw_text?.text ?? status.text ?? "";
  for (const match of text.matchAll(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,15})\b/g)) {
    const target = normalizeUsername(match[2] ?? "");
    if (target) targets.add(target);
  }
  return [...targets];
}

function addEvent(
  out: InteractionEvent[],
  status: FxStatus,
  author: string,
  target: string,
  type: InteractionType,
) {
  if (!status.id || !author || !target || author === target) return;
  const text = normalizeInteractionText(status.raw_text?.text ?? status.text);
  out.push({
    tweetId: status.id,
    author,
    target,
    type,
    ...(text ? { text } : {}),
    createdAt: createdAt(status),
    source: "fxtwitter",
  });
}

/** 将 FxTwitter v2 的真实响应字段转换为统一互动事件。 */
export function fxStatusesToInteractionEvents(
  statuses: readonly FxStatus[],
  selfScreenName: string,
  direction: FxDirection,
): InteractionEvent[] {
  const self = normalizeUsername(selfScreenName);
  const events: InteractionEvent[] = [];

  for (const status of statuses) {
    const author = normalizeUsername(status.author?.screen_name ?? "");
    const rePoster = normalizeUsername(status.reposted_by?.screen_name ?? "");
    const replyTarget = normalizeUsername(status.replying_to?.screen_name ?? "");
    const quoteTarget = normalizeUsername(status.quote?.author?.screen_name ?? "");
    const mentions = mentionTargets(status);

    if (direction === "inbound") {
      if (rePoster && rePoster !== self && author === self) {
        addEvent(events, status, rePoster, self, "repost");
      } else if (author && author !== self) {
        const type: InteractionType =
          replyTarget === self
            ? "reply"
            : quoteTarget === self
              ? "quote"
              : "mention";
        if (
          replyTarget === self ||
          quoteTarget === self ||
          mentions.includes(self)
        ) {
          addEvent(events, status, author, self, type);
        }
      }
      continue;
    }

    if (rePoster === self && author && author !== self) {
      addEvent(events, status, self, author, "repost");
      continue;
    }
    if (author !== self) continue;

    const typedTargets = new Map<string, InteractionType>();
    if (replyTarget && replyTarget !== self) typedTargets.set(replyTarget, "reply");
    if (quoteTarget && quoteTarget !== self && !typedTargets.has(quoteTarget)) {
      typedTargets.set(quoteTarget, "quote");
    }
    for (const target of mentions) {
      if (target !== self && !typedTargets.has(target)) {
        typedTargets.set(target, "mention");
      }
    }
    for (const [target, type] of typedTargets) {
      addEvent(events, status, self, target, type);
    }
  }

  return events;
}

function collectProfileImages(
  statuses: readonly FxStatus[],
  map: Record<string, string>,
) {
  const profiles = statuses.flatMap((status) => [
    status.author,
    status.quote?.author,
    status.reposted_by,
  ]);
  for (const profile of profiles) {
    const name = normalizeUsername(profile?.screen_name ?? "");
    const avatar = profile?.avatar_url?.trim();
    if (name && avatar && !map[name]) map[name] = avatar;
  }
}

function topActors(events: readonly InteractionEvent[], self: string): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const other = event.author === self ? event.target : event.author;
    if (!other || other === self) continue;
    counts.set(other, (counts.get(other) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([name]) => name);
}

async function fetchFxPage(url: URL): Promise<FxListResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "NekoCircle/1.0 (+https://github.com/acnekot/NekoCircle)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FX_TIMEOUT_MS),
  });
  const body = (await response.json()) as FxListResponse;
  // FxTwitter 列表接口用 404 + 空 results 表示没有结果。
  if (!response.ok && !(response.status === 404 && Array.isArray(body.results))) {
    throw new Error(
      `FxTwitter HTTP ${response.status}: ${body.message ?? "request failed"}`,
    );
  }
  return body;
}

async function fetchFxDirection(
  screenName: string,
  direction: FxDirection,
  mode: ScanMode,
): Promise<{ events: InteractionEvent[]; profiles: Record<string, string> }> {
  const self = normalizeUsername(screenName);
  const maxPages = mode === "deep" ? 10 : 5;
  const maxEvents = mode === "deep" ? 1000 : 500;
  const allEvents: InteractionEvent[] = [];
  const profiles: Record<string, string> = {};
  let cursor: string | undefined;
  let previousTop: string[] = [];
  let stableRounds = 0;

  for (let page = 0; page < maxPages && allEvents.length < maxEvents; page++) {
    const url =
      direction === "inbound"
        ? new URL(`${FX_API}/search`)
        : new URL(`${FX_API}/profile/${encodeURIComponent(self)}/statuses`);
    if (direction === "inbound") {
      url.searchParams.set("q", `@${self}`);
      url.searchParams.set("feed", "latest");
    } else {
      url.searchParams.set("with_replies", "true");
    }
    url.searchParams.set("count", String(PAGE_SIZE));
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetchFxPage(url);
    const statuses = response.results ?? [];
    collectProfileImages(statuses, profiles);
    const pageEvents = fxStatusesToInteractionEvents(statuses, self, direction);
    allEvents.push(...pageEvents);

    const currentTop = topActors(allEvents, self);
    if (previousTop.length > 0 && hasRankingConverged(previousTop, currentTop)) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }
    previousTop = currentTop;

    const next = response.cursor?.bottom?.trim();
    if (!next || next === cursor || statuses.length === 0) break;
    cursor = next;
    // 默认先取 3 页；之后榜单连续两轮稳定即可收敛。
    if (page >= 2 && stableRounds >= 2) break;
  }

  return {
    events: mergeInteractionEvents([allEvents]).slice(0, maxEvents),
    profiles,
  };
}

export type FxTwitterInteractionBundle = {
  events: InteractionEvent[];
  peerProfileImages: Record<string, string>;
  selfProfileImage: string | null;
  failures: FxDirection[];
};

export async function fetchFxTwitterInteractionBundle(
  screenName: string,
  mode: ScanMode = "fast",
): Promise<FxTwitterInteractionBundle> {
  const settled = await Promise.allSettled([
    fetchFxDirection(screenName, "inbound", mode),
    fetchFxDirection(screenName, "outbound", mode),
  ]);
  const failures: FxDirection[] = [];
  const groups: InteractionEvent[][] = [];
  const peerProfileImages: Record<string, string> = {};
  settled.forEach((result, index) => {
    const direction: FxDirection = index === 0 ? "inbound" : "outbound";
    if (result.status === "rejected") {
      failures.push(direction);
      console.warn(`[fxtwitter] ${direction} failed:`, result.reason);
      return;
    }
    groups.push(result.value.events);
    Object.assign(peerProfileImages, result.value.profiles);
  });

  const self = normalizeUsername(screenName);
  return {
    events: mergeInteractionEvents(groups),
    peerProfileImages,
    selfProfileImage: peerProfileImages[self] ?? null,
    failures,
  };
}

export const fxTwitterProvider: InteractionProvider = {
  name: "fxtwitter",
  async fetchInteractions(screenName) {
    return (await fetchFxTwitterInteractionBundle(screenName)).events;
  },
};
