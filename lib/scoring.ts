export type ScoringWeights = {
  replyByMe: number;
  repliedByHim: number;
  quoteByMe: number;
  quotedByHim: number;
  rtByMe: number;
  rtedByHim: number;
  mentionByMe: number;
  mentionedByHim: number;
  decayLambda: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  replyByMe: 100,
  repliedByHim: 40,
  quoteByMe: 25,
  quotedByHim: 18,
  rtByMe: 15,
  rtedByHim: 10,
  mentionByMe: 8,
  mentionedByHim: 5,
  decayLambda: 0.05,
};
