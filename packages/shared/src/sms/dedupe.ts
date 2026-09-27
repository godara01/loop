/**
 * Duplicate detection for incoming transaction messages.
 * See docs/12-sms-ingest.md#deduplication.
 *
 * A single card swipe often produces two messages: one from the bank and one
 * from the card network. Both parse to the same amount and the same account
 * last-4 a minute or two apart, so the inbox must collapse them into one
 * pending expense. Separately, a user who has already typed the expense by
 * hand must not be shown the same spend again.
 *
 * Window convention — INCLUSIVE.
 * "within ±10 min" and "within ±30 min" include the exact boundary: an offset
 * of exactly 10:00 (600_000 ms) is inside the 10-minute window, and exactly
 * 30:00 (1_800_000 ms) is inside the 30-minute window. "Within N minutes" in
 * plain English covers the instant N minutes away, and collapsing a borderline
 * pair costs the user one tap while missing one leaves a phantom duplicate in
 * the ledger. The tests pin all six boundaries (9:59 / 10:00 / 10:01 and
 * 29:59 / 30:00 / 30:01) in both directions, so flipping this decision means
 * changing `<=` to `<` below and updating those tests deliberately.
 *
 * All amounts are integer minor units; the comparison is `===` on integers,
 * never a float tolerance.
 */

import type { ExpenseSource } from '../types';
import type { PendingExpenseStatus } from './types';

/** The incoming, not-yet-stored transaction being checked. */
export interface DedupeCandidate {
  readonly amountMinor: number;
  readonly accountLast4: string | null;
  /** ISO-8601 instant the transaction happened. */
  readonly occurredAt: string;
}

/** An already-stored pending expense to compare against. */
export interface DedupePendingExpense {
  readonly amountMinor: number;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly status: PendingExpenseStatus;
}

/**
 * An expense already in the ledger. Only `source: 'manual'` ones take part:
 * an expense approved from a message is already covered, with its account,
 * by the approved pending item it came from.
 */
export interface DedupeManualExpense {
  readonly amountMinor: number;
  readonly occurredAt: string;
  readonly source: ExpenseSource;
}

/** Inclusive half-width of the pending/approved window. */
const PENDING_WINDOW_MS = 10 * 60 * 1000;

/** Inclusive half-width of the manual-expense window. */
const MANUAL_WINDOW_MS = 30 * 60 * 1000;

/** True when `a` and `b` are at most `windowMs` apart, in either direction. */
function withinWindow(a: number, b: number, windowMs: number): boolean {
  return Math.abs(a - b) <= windowMs;
}

/**
 * True when `candidate` describes a spend already represented by something in
 * `existingPending` or `existingManual`.
 *
 * - A `pending` or `approved` item matches on the same `amountMinor` **and**
 *   the same `accountLast4`, within ±10 min. A null `accountLast4` on either
 *   side can never match: without the account there is no evidence the two
 *   messages describe one transaction.
 * - A manual expense (`source: 'manual'`) matches on the same `amountMinor`
 *   alone, within ±30 min. Other sources are skipped: two real ₹100 swipes on
 *   one card 20 minutes apart must not collapse just because the first was
 *   approved into the ledger.
 *   Hand-typed entries carry no account number, so amount and time are all
 *   there is to go on, and the wider window absorbs the lag between the swipe
 *   and the user reaching for the phone.
 * - `rejected` and `expired` pending items never match. The user has already
 *   dismissed those, and a dismissal must not suppress a later real message.
 */
export function isDuplicatePendingExpense(
  candidate: DedupeCandidate,
  existingPending: readonly DedupePendingExpense[],
  existingManual: readonly DedupeManualExpense[],
): boolean {
  const candidateAt = Date.parse(candidate.occurredAt);

  for (const pending of existingPending) {
    if (pending.status !== 'pending' && pending.status !== 'approved') continue;
    if (pending.amountMinor !== candidate.amountMinor) continue;
    if (candidate.accountLast4 === null || pending.accountLast4 === null) continue;
    if (pending.accountLast4 !== candidate.accountLast4) continue;
    if (withinWindow(candidateAt, Date.parse(pending.occurredAt), PENDING_WINDOW_MS)) {
      return true;
    }
  }

  for (const manual of existingManual) {
    if (manual.source !== 'manual') continue;
    if (manual.amountMinor !== candidate.amountMinor) continue;
    if (withinWindow(candidateAt, Date.parse(manual.occurredAt), MANUAL_WINDOW_MS)) {
      return true;
    }
  }

  return false;
}
