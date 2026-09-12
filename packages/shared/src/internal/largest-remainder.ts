/**
 * Largest-remainder distribution — the single implementation of the invariant
 * that every allocation in Loop sums back to its total exactly.
 *
 * Used by split.ts to divide money between people, and by insights.ts to turn
 * shares into whole percentages that add up to 100. Both are the same problem:
 * hand out an integer total in proportion to weights, without losing or
 * inventing a unit.
 */

/**
 * Distributes `total` across `weights` proportionally.
 *
 * Guarantees `sum(result) === total` for any finite non-negative weights and any
 * integer total, positive or negative. Leftover units go to the largest
 * fractional parts first; ties break by index, so the same input always produces
 * the same output.
 *
 * @throws if the weights are not all finite and non-negative, or sum to zero.
 */
export function distributeLargestRemainder(
  total: number,
  weights: readonly number[],
): number[] {
  if (!Number.isInteger(total)) {
    throw new Error(`Total must be an integer, got ${total}`);
  }

  let weightTotal = 0;
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Weights must be finite and non-negative, got ${weight}`);
    }
    weightTotal += weight;
  }
  if (weightTotal <= 0) {
    throw new Error('Total weight must be greater than zero');
  }

  // Work in magnitude so a refund distributes the same way a charge does, then
  // flip the sign back at the end.
  const negative = total < 0;
  const magnitude = Math.abs(total);

  const exact = weights.map((w) => (magnitude * w) / weightTotal);
  const result = exact.map(Math.floor);
  let remainder = magnitude - result.reduce((a, b) => a + b, 0);

  const byFraction = exact
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }

  return negative ? result.map((n) => -n) : result;
}
