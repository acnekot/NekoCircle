import { normalizeUsername } from "@/lib/interactions/normalize";
import type { InteractionScore } from "@/lib/interactions/scoring";
import type { XKitPeerSignal } from "./types";

export const IFOLLOW_SCORE = 0.15;
export const FOLLOWS_ME_SCORE = 0.15;
export const MUTUAL_FOLLOW_BONUS = 0.3;
export const CONVERSATION_SHARE = 0.72;
export const AFFINITY_SHARE = 0.28;

export function continuityScore(activeDays: number): number {
  return Math.min(1, Math.log1p(Math.max(0, activeDays)) / Math.log(15));
}

export function scoreAffinity(peer: XKitPeerSignal): number {
  const likes = Math.log2(peer.weightedLikeCount + 1) *
    (0.8 + 0.2 * continuityScore(peer.likeActiveDays));
  const follows =
    (peer.iFollow ? IFOLLOW_SCORE : 0) +
    (peer.followsMe ? FOLLOWS_ME_SCORE : 0) +
    (peer.mutualFollow ? MUTUAL_FOLLOW_BONUS : 0);
  return likes + follows;
}

function percentileScores(entries: ReadonlyArray<[string, number]>): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const out = new Map<string, number>();
  if (sorted.length === 0) return out;
  if (sorted.length === 1) {
    out.set(sorted[0]![0], sorted[0]![1] > 0 ? 1 : 0);
    return out;
  }
  for (let i = 0; i < sorted.length; i++) {
    const [name, value] = sorted[i]!;
    let start = i;
    let end = i;
    while (start > 0 && sorted[start - 1]![1] === value) start--;
    while (end + 1 < sorted.length && sorted[end + 1]![1] === value) end++;
    out.set(name, (start + end) / (2 * (sorted.length - 1)));
    i = end;
  }
  return out;
}

export type AffinityRankedScore = InteractionScore & {
  conversationScore: number;
  affinityScore: number;
  affinitySources: Array<"xkit-like" | "xkit-follow">;
};

/** Percentile normalization keeps conversation and affinity on comparable scales. */
export function combineConversationAndAffinity(
  conversations: readonly InteractionScore[],
  peers: readonly XKitPeerSignal[],
): AffinityRankedScore[] {
  const conversationsByName = new Map(conversations.map((row) => [normalizeUsername(row.screenName), row]));
  const affinityByName = new Map(peers.map((peer) => [normalizeUsername(peer.screenName), peer]));
  const names = new Set([...conversationsByName.keys(), ...affinityByName.keys()]);
  const conversationPercentiles = percentileScores(
    [...conversationsByName].map(([name, row]) => [name, row.finalScore]),
  );
  const affinityValues = new Map(
    [...affinityByName].map(([name, peer]) => [name, scoreAffinity(peer)]),
  );
  const affinityPercentiles = percentileScores([...affinityValues]);

  return [...names].flatMap((screenName) => {
    const conversation = conversationsByName.get(screenName);
    const peer = affinityByName.get(screenName);
    if (!conversation && !peer) return [];
    const affinityScore = peer ? affinityValues.get(screenName) ?? 0 : 0;
    const finalScore =
      CONVERSATION_SHARE * (conversationPercentiles.get(screenName) ?? 0) +
      AFFINITY_SHARE * (affinityPercentiles.get(screenName) ?? 0);
    return [{
      screenName,
      inbound: conversation?.inbound ?? 0,
      outbound: conversation?.outbound ?? 0,
      inboundCount: conversation?.inboundCount ?? 0,
      outboundCount: conversation?.outboundCount ?? 0,
      interactionCount: conversation?.interactionCount ?? 0,
      balance: conversation?.balance ?? 0,
      finalScore,
      conversationScore: conversation?.finalScore ?? 0,
      affinityScore,
      affinitySources: [
        ...(peer && peer.likeCount > 0 ? (["xkit-like"] as const) : []),
        ...(peer && (peer.iFollow || peer.followsMe) ? (["xkit-follow"] as const) : []),
      ],
      sources: conversation?.sources ?? [],
    }];
  }).sort((a, b) => b.finalScore - a.finalScore || b.interactionCount - a.interactionCount || a.screenName.localeCompare(b.screenName));
}
