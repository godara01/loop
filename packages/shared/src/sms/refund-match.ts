/**
 * Refund matching logic. See docs/17-money-in-and-out.md § Refund matching.
 *
 * `matchRefund(pending, candidates)` is pure. It finds the best expense candidate
 * that could be refunded by the pending transaction.
 */

import type { Expense } from '../types';
import { merchantKey } from '../merchants';
import type { PendingExpense } from './types';
import type { Account } from '../accounts';

/**
 * A pending that has a match suggestion.
 */
export interface RefundMatch {
  /** The expense that should be refunded. */
  readonly expense: Expense;
  /** The pending being matched. */
  readonly pending: PendingExpense;
}

/**
 * Find the best expense candidate that could be refunded by this pending.
 *
 * Candidates are live `expense` documents from the last 60 days, filtered to
 * exclude refunds, transfers, and mirrors. A candidate matches when:
 *
 * 1. `candidate.amountMinor >= pending.amountMinor`, and the pending amount is
 *    within the candidate's refundable remainder.
 * 2. The `merchantKey` is the same, or the `accountLast4` is the same and the
 *    candidate came from SMS.
 * 3. The candidate is not itself a refund, transfer, or mirror.
 *
 * Ranking: exact amount first, then the same merchant, then the most recent.
 * Only the top match is suggested.
 *
 * @param pending - The pending transaction (credit) that may be a refund
 * @param candidates - Live expense documents from the last 60 days
 * @param accounts - Known accounts to look up last4 from accountId (required)
 * @returns The best match, or null if no match found
 */
export function matchRefund(
  pending: PendingExpense,
  candidates: readonly Expense[],
  accounts: readonly Account[],
): RefundMatch | null {
  const pendingAmount = pending.amountMinor;
  const pendingMerchantKey = pending.merchantKey ?? null;
  const pendingAccountLast4 = pending.accountLast4 ?? null;

  // Build a map of accountId -> last4 for quick lookup
  const accountLast4Map = new Map<string, string | null>();
  for (const acc of accounts) {
    accountLast4Map.set(acc.id, acc.last4);
  }

  // First pass: collect candidates that match on merchantKey or accountLast4
  const strongMatches: { candidate: Expense; score: number }[] = [];
  // Second pass: collect amount-only candidates (for the special case)
  const amountOnlyCandidates: Expense[] = [];

  // Check if this is the amount-only case (no merchantKey, no usable accountLast4)
  const isAmountOnlyCase = pendingMerchantKey === null && pendingAccountLast4 === null;

  for (const candidate of candidates) {
    // Rule 3: not a refund, transfer, or mirror (check first for efficiency)
    const kind = candidate.kind ?? 'expense';
    if (kind !== 'expense') {
      continue;
    }
    // Mirrors have groupId and source === 'group'
    if (candidate.groupId !== null && candidate.source === 'group') {
      continue;
    }
    // Skip soft-deleted
    if (candidate.deletedAt !== null) {
      continue;
    }

    // Rule 1: candidate.amountMinor >= pending.amountMinor AND within refundable remainder
    const candidateAmount = candidate.total.minor;
    if (candidateAmount < pendingAmount) {
      continue;
    }

    const refundableRemainder = refundableRemainderForExpense(candidate, candidates);
    if (pendingAmount > refundableRemainder) {
      continue;
    }

    // Rule 2: merchantKey match OR (accountLast4 match AND candidate from SMS)
    let matchesRule2 = false;

    // Check merchantKey match
    if (pendingMerchantKey !== null && pendingMerchantKey !== undefined && 
        candidate.merchantKey !== null && candidate.merchantKey !== undefined) {
      const pendingKeyResult = merchantKey(pendingMerchantKey);
      const candidateKeyResult = merchantKey(candidate.merchantKey);
      if (pendingKeyResult.key !== null &&
          candidateKeyResult.key !== null &&
          pendingKeyResult.key === candidateKeyResult.key) {
        matchesRule2 = true;
      }
    }

    // Check accountLast4 match (only if candidate is from SMS and has accountId)
    if (!matchesRule2 && pendingAccountLast4 !== null && candidate.source === 'sms' && candidate.accountId) {
      const candidateLast4 = accountLast4Map.get(candidate.accountId);
      if (candidateLast4 !== undefined && candidateLast4 === pendingAccountLast4) {
        matchesRule2 = true;
      }
    }

    if (matchesRule2) {
      // Strong match: has merchantKey or accountLast4 match
      // Ranking: exact amount first, then same merchant, then most recent
      const exactAmount = pendingAmount === candidateAmount ? 1 : 0;
      const pendingKeyResult = pendingMerchantKey !== null && pendingMerchantKey !== undefined ? merchantKey(pendingMerchantKey) : { key: null };
      const candidateKeyResult = candidate.merchantKey !== null && candidate.merchantKey !== undefined ? merchantKey(candidate.merchantKey) : { key: null };
      const sameMerchant = (pendingKeyResult.key !== null && candidateKeyResult.key !== null && pendingKeyResult.key === candidateKeyResult.key) ? 1 : 0;
      // More recent = higher score (use positive timestamp so newer dates score higher)
      const timestamp = Date.parse(candidate.occurredAt);

      // Use large multipliers to ensure proper ranking priority
      strongMatches.push({ candidate, score: exactAmount * 1e15 + sameMerchant * 1e12 + timestamp });
    } else if (isAmountOnlyCase) {
      // Amount-only case: candidate satisfies amount rule but no merchant/account match
      amountOnlyCandidates.push(candidate);
    }
  }

  // If we have strong matches, return the best one
  if (strongMatches.length > 0) {
    strongMatches.sort((a, b) => b.score - a.score);
    const best = strongMatches[0]!;
    return { expense: best.candidate, pending };
  }

  // Amount-only case: suggest only if exactly one candidate
  if (isAmountOnlyCase && amountOnlyCandidates.length === 1) {
    return { expense: amountOnlyCandidates[0]!, pending };
  }

  return null;
}

/**
 * Calculate how much of an expense can still be refunded.
 *
 * @param expense - The original expense
 * @param allExpenses - All expenses (to find existing refunds)
 * @returns The refundable remainder in minor units
 */
export function refundableRemainderForExpense(
  expense: Expense,
  allExpenses: readonly Expense[],
): number {
  const originalAmount = expense.total.minor;
  let refundedAmount = 0;

  for (const e of allExpenses) {
    if (e.refundOf === expense.id && e.kind === 'refund') {
      refundedAmount += e.total.minor;
    }
  }

  return originalAmount - refundedAmount;
}