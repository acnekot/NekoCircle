import type {
  InteractionEvent,
  InteractionSource,
  InteractionType,
} from "@/types/interaction";
import { normalizeUsername } from "./normalize";

export const INTERACTION_TYPE_WEIGHTS: Record<InteractionType, number> = {
  reply: 1,
  quote: 0.8,
  mention: 0.6,
  repost: 0.4,
};

/** 入站更能代表「对方主动找你」，出站则降低到原来的一半。 */
export const INBOUND_DIRECTION_WEIGHT = 1.5;
export const OUTBOUND_DIRECTION_WEIGHT = 0.5;

const LATEST_WINDOW_DAYS = 2;
const BOOSTED_WINDOW_END_DAYS = 5;
const BOOSTED_WINDOW_WEIGHT = 0.95;
const OLDER_DECAY_DAYS = 15;

export type InteractionScore = {
  screenName: string;
  inbound: number;
  outbound: number;
  inboundCount: number;
  outboundCount: number;
  interactionCount: number;
  balance: number;
  finalScore: number;
  sources: InteractionSource[];
};

function toMilliseconds(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

export function calculateTimeWeight(
  createdAt: number | undefined,
  now = Date.now(),
): number {
  if (createdAt === undefined || !Number.isFinite(createdAt)) return 1;
  const daysAgo = Math.max(0, now - toMilliseconds(createdAt)) / 86_400_000;
  // 0–2 天作为最新一档；3–5 天提高保留权重。超过 5 天后从该档位
  // 连续指数衰减，既不制造断崖，也会让越久远的互动下降得越明显。
  if (daysAgo <= LATEST_WINDOW_DAYS) return 1;
  if (daysAgo <= BOOSTED_WINDOW_END_DAYS) return BOOSTED_WINDOW_WEIGHT;
  return (
    BOOSTED_WINDOW_WEIGHT *
    Math.exp(-(daysAgo - BOOSTED_WINDOW_END_DAYS) / OLDER_DECAY_DAYS)
  );
}

export function calculateBalance(inbound: number, outbound: number): number {
  const total = inbound + outbound;
  if (total <= 0) return 0;
  return (2 * Math.min(inbound, outbound)) / total;
}

export function calculateEventWeight(
  event: Pick<InteractionEvent, "type" | "createdAt">,
  now = Date.now(),
): number {
  return INTERACTION_TYPE_WEIGHTS[event.type] * calculateTimeWeight(event.createdAt, now);
}

/** 将统一事件按目标用户聚合为带时间衰减和双向奖励的关系分数。 */
export function scoreInteractions(
  events: readonly InteractionEvent[],
  selfScreenName: string,
  now = Date.now(),
): InteractionScore[] {
  const self = normalizeUsername(selfScreenName);
  const rows = new Map<
    string,
    Omit<InteractionScore, "screenName" | "balance" | "finalScore" | "sources"> & {
      sources: Set<InteractionSource>;
    }
  >();

  for (const event of events) {
    const author = normalizeUsername(event.author);
    const target = normalizeUsername(event.target);
    const incoming = target === self && author !== self;
    const outgoing = author === self && target !== self;
    if (!incoming && !outgoing) continue;

    const other = incoming ? author : target;
    if (!other) continue;
    const row = rows.get(other) ?? {
      inbound: 0,
      outbound: 0,
      inboundCount: 0,
      outboundCount: 0,
      interactionCount: 0,
      sources: new Set<InteractionSource>(),
    };
    const weight = calculateEventWeight(event, now);
    if (incoming) {
      row.inbound += weight;
      row.inboundCount += 1;
    } else {
      row.outbound += weight;
      row.outboundCount += 1;
    }
    row.interactionCount += 1;
    row.sources.add(event.source);
    for (const source of event.sources ?? []) row.sources.add(source);
    rows.set(other, row);
  }

  return [...rows.entries()]
    .map(([screenName, row]): InteractionScore => {
      const total =
        row.inbound * INBOUND_DIRECTION_WEIGHT +
        row.outbound * OUTBOUND_DIRECTION_WEIGHT;
      const balance = calculateBalance(row.inbound, row.outbound);
      return {
        screenName,
        inbound: row.inbound,
        outbound: row.outbound,
        inboundCount: row.inboundCount,
        outboundCount: row.outboundCount,
        interactionCount: row.interactionCount,
        balance,
        finalScore: Math.log1p(total) * (0.75 + 0.25 * balance),
        sources: [...row.sources],
      };
    })
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.interactionCount - a.interactionCount ||
        a.screenName.localeCompare(b.screenName),
    );
}
