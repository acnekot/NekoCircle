import { getSetting } from "@/lib/db";
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from "@/lib/scoring";

export type AnalysisWeights = ScoringWeights;

export type AnalysisRuntimeConfig = {
  apiKeys: string[];
  useMock: boolean;
  tweetLimit: number;
  defaultTopCount: number;
  weights: AnalysisWeights;
};

function toInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getAnalysisRuntimeConfig(): AnalysisRuntimeConfig {
  const apiKey = getSetting("api_key");
  const apiKeysRaw = getSetting("api_keys");
  const extraKeys = apiKeysRaw
    .split(/[\n,]+/)
    .map((key) => key.trim())
    .filter(Boolean);

  return {
    apiKeys: [apiKey, ...extraKeys].filter(Boolean),
    useMock: getSetting("mock_mode") === "1",
    tweetLimit: toInt(getSetting("tweet_limit"), 20),
    defaultTopCount: toInt(getSetting("top_count"), 30),
    weights: {
      replyByMe: toInt(getSetting("affinity_weight_reply_by_me"), DEFAULT_SCORING_WEIGHTS.replyByMe),
      repliedByHim: toInt(getSetting("affinity_weight_replied_by_him"), DEFAULT_SCORING_WEIGHTS.repliedByHim),
      quoteByMe: toInt(getSetting("affinity_weight_quote_by_me"), DEFAULT_SCORING_WEIGHTS.quoteByMe),
      quotedByHim: toInt(getSetting("affinity_weight_quoted_by_him"), DEFAULT_SCORING_WEIGHTS.quotedByHim),
      rtByMe: toInt(getSetting("affinity_weight_rt_by_me"), DEFAULT_SCORING_WEIGHTS.rtByMe),
      rtedByHim: toInt(getSetting("affinity_weight_rted_by_him"), DEFAULT_SCORING_WEIGHTS.rtedByHim),
      mentionByMe: toInt(getSetting("affinity_weight_mention_by_me"), DEFAULT_SCORING_WEIGHTS.mentionByMe),
      mentionedByHim: toInt(getSetting("affinity_weight_mentioned_by_him"), DEFAULT_SCORING_WEIGHTS.mentionedByHim),
      decayLambda: toFloat(getSetting("affinity_decay_lambda"), DEFAULT_SCORING_WEIGHTS.decayLambda),
    },
  };
}
