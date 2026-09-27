import type {
  InteractionEvent,
  InteractionSource,
} from "@/types/interaction";
import { normalizeUsername } from "./normalize";

function eventKey(event: InteractionEvent): string {
  return [
    event.tweetId.trim(),
    normalizeUsername(event.author),
    normalizeUsername(event.target),
    event.type,
  ].join("|");
}

/** 按 tweetId + author + target + type 去重，并合并数据源标记。 */
export function mergeInteractionEvents(
  groups: ReadonlyArray<ReadonlyArray<InteractionEvent>>,
): InteractionEvent[] {
  const merged = new Map<
    string,
    InteractionEvent & { sources: InteractionSource[] }
  >();

  // Yahoo emits generic mentions for outbound replies. Match the same tweet
  // and account pair, while preserving other targets and ambiguous types.
  const pairKey = (event: InteractionEvent) => eventKey({ ...event, type: "mention" });
  const fxTypes = new Map<string, Set<InteractionEvent["type"]>>();
  for (const event of groups.flatMap((group) => [...group])) {
    if (event.source !== "fxtwitter") continue;
    const key = pairKey(event);
    const types = fxTypes.get(key) ?? new Set<InteractionEvent["type"]>();
    types.add(event.type);
    fxTypes.set(key, types);
  }

  for (const group of groups) {
    for (const event of group) {
      const types = fxTypes.get(pairKey(event));
      const raw = event.source === "yahoo" && event.type === "mention" && types?.size === 1
        ? { ...event, type: [...types][0] }
        : event;
      const tweetId = raw.tweetId.trim();
      const author = normalizeUsername(raw.author);
      const target = normalizeUsername(raw.target);
      if (!tweetId || !author || !target || author === target) continue;

      const normalized: InteractionEvent = {
        ...raw,
        tweetId,
        author,
        target,
      };
      const key = eventKey(normalized);
      const sources = new Set<InteractionSource>([
        raw.source,
        ...(raw.sources ?? []),
      ]);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...normalized, sources: [...sources] });
        continue;
      }

      for (const source of sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      }
      if (
        normalized.createdAt !== undefined &&
        (existing.createdAt === undefined || normalized.createdAt > existing.createdAt)
      ) {
        existing.createdAt = normalized.createdAt;
      }
      if (
        normalized.text &&
        (!existing.text || normalized.text.length > existing.text.length)
      ) {
        existing.text = normalized.text;
      }
    }
  }

  return [...merged.values()];
}
