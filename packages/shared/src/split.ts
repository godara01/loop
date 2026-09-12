/**
 * Split allocation. Every function here guarantees the allocations sum back to
 * the input total exactly — no rounding drift, no lost paise. Remainders are
 * distributed by the largest-remainder method, with ties broken deterministically
 * by participant order so the same input always produces the same split.
 */

import { distributeLargestRemainder } from './internal/largest-remainder';
import { type CurrencyCode, type Money, money } from './money';

export type SplitMode = 'even' | 'shares' | 'exact' | 'percentage';

export interface SplitParticipant {
  readonly memberId: string;
  /** Weight for 'shares' mode (e.g. 2 for someone eating double). */
  readonly shares?: number;
  /** Minor units for 'exact' mode. */
  readonly exactMinor?: number;
  /** 0–100 for 'percentage' mode. */
  readonly percentage?: number;
}

export interface Allocation {
  readonly memberId: string;
  readonly amount: Money;
}

export class SplitError extends Error {}

/** Dispatches to the right strategy and validates the result sums to `total`. */
export function allocate(
  total: Money,
  mode: SplitMode,
  participants: readonly SplitParticipant[],
): Allocation[] {
  if (participants.length === 0) {
    throw new SplitError('Cannot split between zero participants');
  }

  const allocations = runStrategy(total, mode, participants);

  const allocated = allocations.reduce((acc, a) => acc + a.amount.minor, 0);
  if (allocated !== total.minor) {
    throw new SplitError(
      `Allocation drift: allocated ${allocated} but total is ${total.minor}`,
    );
  }
  return allocations;
}

function runStrategy(
  total: Money,
  mode: SplitMode,
  participants: readonly SplitParticipant[],
): Allocation[] {
  switch (mode) {
    case 'even':
      return distribute(total, participants.map(() => 1), participants);

    case 'shares': {
      const weights = participants.map((p) => {
        const shares = p.shares ?? 1;
        if (!Number.isFinite(shares) || shares < 0) {
          throw new SplitError(`Invalid share weight for ${p.memberId}: ${shares}`);
        }
        return shares;
      });
      if (weights.every((w) => w === 0)) {
        throw new SplitError('All share weights are zero');
      }
      return distribute(total, weights, participants);
    }

    case 'percentage': {
      const weights = participants.map((p) => {
        const pct = p.percentage ?? 0;
        if (!Number.isFinite(pct) || pct < 0) {
          throw new SplitError(`Invalid percentage for ${p.memberId}: ${pct}`);
        }
        return pct;
      });
      const totalPct = weights.reduce((a, b) => a + b, 0);
      // Allow float fuzz from UI sliders, but reject genuinely wrong input.
      if (Math.abs(totalPct - 100) > 0.01) {
        throw new SplitError(`Percentages must total 100, got ${totalPct}`);
      }
      return distribute(total, weights, participants);
    }

    case 'exact': {
      const allocations = participants.map((p) => {
        const exact = p.exactMinor ?? 0;
        if (!Number.isInteger(exact)) {
          throw new SplitError(`Exact amount for ${p.memberId} must be integer minor units`);
        }
        return { memberId: p.memberId, amount: money(exact, total.currency) };
      });
      const allocated = allocations.reduce((acc, a) => acc + a.amount.minor, 0);
      if (allocated !== total.minor) {
        throw new SplitError(
          `Exact amounts total ${allocated} but the bill is ${total.minor}`,
        );
      }
      return allocations;
    }
  }
}

/**
 * Weighted allocation of an integer amount, largest-remainder method.
 * Guarantees sum(result) === total.minor for any finite non-negative weights.
 */
function distribute(
  total: Money,
  weights: readonly number[],
  participants: readonly SplitParticipant[],
): Allocation[] {
  let shares: number[];
  try {
    shares = distributeLargestRemainder(total.minor, weights);
  } catch (error) {
    // The shared distributor speaks in numbers; splits speak in SplitError.
    throw new SplitError(error instanceof Error ? error.message : String(error));
  }

  return participants.map((p, i) => ({
    memberId: p.memberId,
    amount: money(shares[i] ?? 0, total.currency),
  }));
}

/** Convenience for the most common case: an even n-way split. */
export function splitEvenly(
  total: Money,
  memberIds: readonly string[],
): Allocation[] {
  return allocate(total, 'even', memberIds.map((memberId) => ({ memberId })));
}

/** Human-readable ratio label for the ledger UI, e.g. "50/50" or "2:1:1". */
export function ratioLabel(allocations: readonly Allocation[]): string {
  const total = allocations.reduce((acc, a) => acc + a.amount.minor, 0);
  if (total === 0) return '—';
  const allEqual = allocations.every((a) => a.amount.minor === allocations[0]?.amount.minor);
  if (allEqual) {
    const share = Math.round(100 / allocations.length);
    return allocations.map(() => share).join('/');
  }
  return allocations
    .map((a) => `${Math.round((a.amount.minor / total) * 100)}%`)
    .join(' · ');
}

export function zeroAllocation(memberId: string, currency: CurrencyCode): Allocation {
  return { memberId, amount: money(0, currency) };
}
