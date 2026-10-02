/** Number of items in the same place in both orders. */
export function correctPositions(order: readonly string[], correct: readonly string[]): number {
  return order.filter((id, index) => correct[index] === id).length;
}

/**
 * Share of item pairs that `order` puts the same way round as `correct` — Kendall's tau
 * rescaled to 0..1 ((tau + 1) / 2): 1 when right, 0 when fully reversed.
 */
export function pairShare(order: readonly string[], correct: readonly string[]): number {
  const rank = new Map(correct.map((id, index) => [id, index]));
  const ranks = order.map((id) => rank.get(id) ?? 0);
  let concordant = 0;
  let pairs = 0;
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i + 1; j < ranks.length; j++) {
      pairs++;
      if ((ranks[i] ?? 0) < (ranks[j] ?? 0)) concordant++;
    }
  }
  return pairs > 0 ? concordant / pairs : 0;
}

export function pointsFor(baseScore: number, share: number, multiplier: number): number {
  return Math.round(Math.round(baseScore * share) * multiplier);
}
