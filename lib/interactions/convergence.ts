/** 返回两轮 Top N 的重合比例；不足 N 人时按实际榜单长度计算。 */
export function rankingOverlap(
  previous: readonly string[],
  current: readonly string[],
  topN = 30,
): number {
  const prev = previous.slice(0, topN);
  const curr = current.slice(0, topN);
  const denominator = Math.min(topN, Math.max(prev.length, curr.length));
  if (denominator === 0) return 1;
  const prevSet = new Set(prev);
  let intersection = 0;
  for (const name of new Set(curr)) {
    if (prevSet.has(name)) intersection += 1;
  }
  return intersection / denominator;
}

export function hasRankingConverged(
  previous: readonly string[],
  current: readonly string[],
  threshold = 0.9,
  topN = 30,
): boolean {
  return rankingOverlap(previous, current, topN) >= threshold;
}
