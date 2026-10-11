/**
 * Accounts (payment methods) and their balances. See docs/18-accounts.md.
 *
 * The balance is `openingBalance + flowMinor + localDelta`: `flowMinor` is the
 * Function-maintained signed sum of every live transaction's effect on the
 * account (users/{uid}/accountBalances/{accountId}), and `localDelta` is applied
 * by the client for documents that still have pending writes, using the
 * owner-readable `rollupApplied/{expenseId}` marker so an edit is exact.
 *
 * Everything here is pure and framework-free: it runs in the app (offline), in
 * Cloud Functions, and later in the MCP server.
 */

import { money, type Money } from './money';
import type { CategoryColorToken } from './theme';
import type { Expense } from './types';

/** An account where money sits or comes from. `card` is a credit card. */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  /** 4 digits; bank or card only; used for SMS matching. Null otherwise. */
  readonly last4: string | null;
  /** Ledger currency; may be negative (a card owed at the start). */
  readonly openingBalance: Money;
  /** YYYY-MM-DD. Transactions dated before this are still counted. */
  readonly openingDate: string;
  /** One of the same eight tokens categories use. */
  readonly colorToken: CategoryColorToken;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export type AccountType = 'cash' | 'bank' | 'card' | 'wallet';

/** What the form collects; the repository stamps `id` and the timestamps. */
export interface AccountDraft {
  readonly name: string;
  readonly type: AccountType;
  readonly last4: string | null;
  readonly openingBalance: Money;
  readonly openingDate: string;
  readonly colorToken: CategoryColorToken;
  readonly sortOrder: number;
}

export type AccountValidationError =
  | 'name_empty'
  | 'name_too_long'
  | 'type_invalid'
  | 'last4_invalid'
  | 'opening_balance_invalid'
  | 'opening_date_invalid'
  | 'color_invalid'
  | 'sort_order_invalid';

export const MAX_ACCOUNT_NAME_LENGTH = 24;

const ACCOUNT_TYPES: readonly AccountType[] = ['cash', 'bank', 'card', 'wallet'];
const COLOR_TOKENS: readonly CategoryColorToken[] = [
  'lime', 'limeDeep', 'coral', 'violet', 'ice', 'amber', 'rose', 'steel',
];
const LAST4 = /^[0-9]{4}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates an account draft. Mirrors the writes the security rules allow
 * (docs/18 § Data and rules), so the form and the rules cannot disagree.
 */
export function validateAccountDraft(draft: AccountDraft): AccountValidationError | null {
  const name = draft.name.trim();
  if (name.length === 0) return 'name_empty';
  if (name.length > MAX_ACCOUNT_NAME_LENGTH) return 'name_too_long';

  if (!ACCOUNT_TYPES.includes(draft.type)) return 'type_invalid';

  if (draft.last4 !== null && !LAST4.test(draft.last4)) return 'last4_invalid';

  if (!Number.isInteger(draft.openingBalance.minor)) return 'opening_balance_invalid';

  if (!LOCAL_DATE.test(draft.openingDate)) return 'opening_date_invalid';

  if (!COLOR_TOKENS.includes(draft.colorToken)) return 'color_invalid';

  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) return 'sort_order_invalid';

  return null;
}

/** One account's signed contribution to a transaction. */
export interface AccountFlow {
  readonly accountId: string;
  readonly deltaMinor: number;
}

/**
 * The accounts a transaction moves and by how much. Summed over every live
 * transaction this is exactly `accountBalances/{id}.flowMinor`.
 *
 * Squad mirrors move the payer's account by what they actually paid
 * (`paidMinor`), not by their share — if you paid ₹1,200 for dinner, ₹1,200
 * left your account even though your share was ₹300.
 */
export function effectOf(tx: Expense): readonly AccountFlow[] {
  // `flowMinor` sums only live transactions; a soft-deleted one moves nothing.
  if (tx.deletedAt !== null && tx.deletedAt !== undefined) return [];

  const kind = tx.kind ?? 'expense';
  const amount = tx.total.minor;
  const accountId = tx.accountId ?? null;
  const toAccountId = tx.toAccountId ?? null;
  const flows: AccountFlow[] = [];

  switch (kind) {
    case 'expense': {
      if (accountId !== null) {
        const paid = tx.paidMinor ?? amount;
        flows.push({ accountId, deltaMinor: -paid });
      }
      break;
    }
    case 'income':
    case 'refund': {
      if (accountId !== null) flows.push({ accountId, deltaMinor: amount });
      break;
    }
    case 'transfer': {
      if (accountId !== null && toAccountId !== null && accountId !== toAccountId) {
        flows.push({ accountId, deltaMinor: -amount });
        flows.push({ accountId: toAccountId, deltaMinor: amount });
      }
      break;
    }
    case 'settlement':
    case 'loan': {
      if (accountId !== null) {
        flows.push({ accountId, deltaMinor: tx.direction === 'in' ? amount : -amount });
      }
      break;
    }
    default:
      break;
  }

  return flows;
}

/** The `rollupApplied/{expenseId}` markers, keyed by expense id. */
export type AccountMarkers = Readonly<Record<string, readonly AccountFlow[]>>;

function flowFor(flows: readonly AccountFlow[] | undefined, accountId: string): number {
  if (flows === undefined) return 0;
  return flows
    .filter((flow) => flow.accountId === accountId)
    .reduce((sum, flow) => sum + flow.deltaMinor, 0);
}

/**
 * The account's balance, equal to the value once every pending write has
 * synced.
 *
 * @param opening the account's opening balance
 * @param flow the account's last server `flowMinor` as an `AccountFlow`
 * @param pendingDocs documents with `hasPendingWrites` (new, edited or soft-deleted)
 * @param markers the `rollupApplied` markers by expense id
 */
export function accountBalance(
  opening: Money,
  flow: AccountFlow,
  pendingDocs: readonly Expense[],
  markers: AccountMarkers,
): Money {
  let minor = opening.minor + flow.deltaMinor;

  for (const tx of pendingDocs) {
    const marker = flowFor(markers[tx.id], flow.accountId);

    if (tx.deletedAt !== null && tx.deletedAt !== undefined) {
      // Soft-deleted: take back whatever the marker last applied.
      minor -= marker;
      continue;
    }

    // New document (no marker): its full effect. Edited document: local − marker.
    minor += flowFor(effectOf(tx), flow.accountId) - marker;
  }

  return money(minor, opening.currency);
}

/**
 * Picks the account an SMS `last4` belongs to. Deliberately conservative: an
 * ambiguous `last4` (two active accounts share it) or an archived match both
 * return null, so the card offers a choice instead of guessing.
 */
export function matchAccount(last4: string | null, accounts: readonly Account[]): Account | null {
  if (last4 === null || !LAST4.test(last4)) return null;

  let match: Account | null = null;
  for (const account of accounts) {
    if (account.archivedAt !== null) continue;
    if (account.last4 !== last4) continue;
    if (match !== null) return null; // more than one — no guess
    match = account;
  }
  return match;
}
