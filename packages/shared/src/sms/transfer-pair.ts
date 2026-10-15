/**
 * Transfer pairing logic. See docs/17-money-in-and-out.md § Transfer pairing.
 *
 * `pairTransfers(pendings, accounts)` is pure. It finds pairs of pending transactions
 * where a debit and a credit of the same amount occur within 10 minutes.
 */

import type { PendingExpense } from './types';
import type { TransactionKind } from '../types';
import type { Account } from '../accounts';
import { matchAccount } from '../accounts';

const MINUTES_10_MS = 10 * 60 * 1000;

/**
 * A pair of pendings that form a transfer.
 */
export interface TransferPair {
  /** The debit pending (money leaving one account). */
  readonly debit: PendingExpense;
  /** The credit pending (money arriving in another account). */
  readonly credit: PendingExpense;
}

/**
 * Find pairs of pendings that form transfers.
 *
 * A debit on one account and a credit of the same amount on another account,
 * within 10 minutes, is almost always a transfer (moving money between accounts).
 *
 * Both accounts must be known. If either last4 is unmatched, no pair is suggested.
 * Each pending can only appear in at most one pair.
 *
 * @param pendings - All pending transactions
 * @param accounts - Known accounts to verify last4 values (required)
 * @returns An array of transfer pairs
 */
export function pairTransfers(
  pendings: readonly PendingExpense[],
  accounts: readonly Account[],
): TransferPair[] {
  const pairs: TransferPair[] = [];
  const used = new Set<string>();

  // Separate debits and credits with their resolved accounts
  const debits: { pending: PendingExpense; account: Account }[] = [];
  const credits: { pending: PendingExpense; account: Account }[] = [];

  for (const p of pendings) {
    // Skip already used pendings
    if (used.has(p.id)) {
      continue;
    }

    // Both accounts must be known: resolve account via matchAccount
    const account = matchAccount(p.accountLast4, accounts);
    if (!account) {
      continue;
    }

    // Determine direction from kind: expense = debit, income/refund/transfer = credit
    // Per docs/17 § Credit SMS: refund is a credit ("refund of Rs 499 … credited")
    const kind: TransactionKind = p.kind ?? 'expense';
    if (kind === 'expense') {
      debits.push({ pending: p, account });
    } else if (kind === 'income' || kind === 'refund' || kind === 'transfer') {
      credits.push({ pending: p, account });
    }
  }

  // For each debit, find a matching credit
  for (const debit of debits) {
    if (used.has(debit.pending.id)) {
      continue;
    }

    let bestCredit: { pending: PendingExpense; account: Account } | null = null;
    let bestScore = -Infinity;

    for (const credit of credits) {
      if (used.has(credit.pending.id)) {
        continue;
      }

      // Must be different accounts (by id, not just last4)
      if (debit.account.id === credit.account.id) {
        continue;
      }

      // Must be same amount
      if (debit.pending.amountMinor !== credit.pending.amountMinor) {
        continue;
      }

      // Must be within 10 minutes
      const debitTime = Date.parse(debit.pending.occurredAt);
      const creditTime = Date.parse(credit.pending.occurredAt);
      const timeDiff = Math.abs(debitTime - creditTime);
      if (timeDiff > MINUTES_10_MS) {
        continue;
      }

      // Score: prefer closer in time
      const score = -timeDiff;
      if (score > bestScore) {
        bestScore = score;
        bestCredit = credit;
      }
    }

    if (bestCredit) {
      pairs.push({ debit: debit.pending, credit: bestCredit.pending });
      used.add(debit.pending.id);
      used.add(bestCredit.pending.id);
    }
  }

  return pairs;
}
