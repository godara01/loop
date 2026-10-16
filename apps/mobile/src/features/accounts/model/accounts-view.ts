/**
 * What the accounts screens and the Orbit card show, as pure functions
 * (docs/18-accounts.md § Screens). Screens do no arithmetic of their own.
 */

import {
  type Account,
  type AccountDraft,
  type AccountType,
  type AccountValidationError,
  type CategoryColorToken,
  type CurrencyCode,
  type Money,
  money,
  validateAccountDraft,
} from '@loop/shared';

export interface BalanceRow {
  readonly account: Account;
  readonly balance: Money;
}

export interface BalanceDisplay {
  /** Cards: OUTSTANDING when owed, CREDIT when overpaid. Others: none. */
  readonly label: 'OUTSTANDING' | 'CREDIT' | null;
  /** The amount to print. A card's outstanding prints as a positive amount after its label. */
  readonly amount: Money;
  /** coral for anything negative (no warning, docs/18 § Edge cases), lime for card credit. */
  readonly tone: 'debit' | 'credit' | 'neutral';
}

export function balanceDisplay(account: Account, balance: Money): BalanceDisplay {
  if (account.type === 'card') {
    if (balance.minor < 0) return { label: 'OUTSTANDING', amount: money(-balance.minor, balance.currency), tone: 'debit' };
    if (balance.minor > 0) return { label: 'CREDIT', amount: balance, tone: 'credit' };
    return { label: null, amount: balance, tone: 'neutral' };
  }
  return { label: null, amount: balance, tone: balance.minor < 0 ? 'debit' : 'neutral' };
}

export const isActive = (account: Account) => account.archivedAt === null;

/** Active by `sortOrder` (then name), archived after, the way the list shows them. */
export function splitAccounts<T extends { readonly account: Account }>(rows: readonly T[]): { active: T[]; archived: T[] } {
  const ordered = [...rows].sort((a, b) => a.account.sortOrder - b.account.sortOrder || a.account.name.localeCompare(b.account.name));
  return { active: ordered.filter((row) => isActive(row.account)), archived: ordered.filter((row) => !isActive(row.account)) };
}

/** "Accounts total": active balances only; a card's outstanding counts as negative. */
export function accountsTotal(rows: readonly BalanceRow[], currency: CurrencyCode): Money {
  return money(
    rows.filter((row) => isActive(row.account)).reduce((sum, row) => sum + row.balance.minor, 0),
    currency,
  );
}

/** The Orbit card: up to 3 active accounts by `sortOrder`, and the total. Null with no accounts. */
export function orbitAccounts(rows: readonly BalanceRow[], currency: CurrencyCode): { rows: BalanceRow[]; total: Money } | null {
  const { active } = splitAccounts(rows);
  if (active.length === 0) return null;
  return { rows: active.slice(0, 3), total: accountsTotal(rows, currency) };
}

/** New `sortOrder`s from a drag result: one write per account, in the new order. */
export function reorderAccounts(orderedIds: readonly string[], accounts: readonly Account[]): Account[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const reordered: Account[] = [];
  orderedIds.forEach((id, sortOrder) => {
    const account = byId.get(id);
    if (account) reordered.push({ ...account, sortOrder });
  });
  return reordered;
}

export const ACCOUNT_TYPES: readonly { readonly type: AccountType; readonly label: string; readonly glyph: string }[] = [
  { type: 'cash', label: 'Cash', glyph: 'cash-outline' },
  { type: 'bank', label: 'Bank', glyph: 'business-outline' },
  { type: 'card', label: 'Card', glyph: 'card-outline' },
  { type: 'wallet', label: 'Wallet', glyph: 'wallet-outline' },
];

/** last4 is for SMS matching: bank and card only. */
export const hasLast4 = (type: AccountType) => type === 'bank' || type === 'card';

export interface AccountForm {
  readonly name: string;
  readonly type: AccountType;
  readonly last4: string;
  /** Minor units, as typed, always ≥ 0. */
  readonly openingMinor: number;
  /** Cards: the ± toggle. True = owed at the start, stored negative. */
  readonly openingOwed: boolean;
  readonly openingDate: string;
  readonly colorToken: CategoryColorToken;
}

export function formFromAccount(account: Account): AccountForm {
  return {
    name: account.name,
    type: account.type,
    last4: account.last4 ?? '',
    openingMinor: Math.abs(account.openingBalance.minor),
    openingOwed: account.openingBalance.minor < 0,
    openingDate: account.openingDate,
    colorToken: account.colorToken,
  };
}

export function draftFromForm(form: AccountForm, currency: CurrencyCode, sortOrder: number): AccountDraft {
  const owed = form.type === 'card' && form.openingOwed;
  return {
    name: form.name.trim(),
    type: form.type,
    last4: hasLast4(form.type) && form.last4.trim() !== '' ? form.last4.trim() : null,
    openingBalance: money(owed ? -form.openingMinor : form.openingMinor, currency),
    openingDate: form.openingDate,
    colorToken: form.colorToken,
    sortOrder,
  };
}

export const ACCOUNT_ERRORS: Record<AccountValidationError, string> = {
  name_empty: 'Give it a name.',
  name_too_long: 'Keep it under 24 characters.',
  type_invalid: 'Pick a type.',
  last4_invalid: 'Last 4 is four digits.',
  opening_balance_invalid: 'That balance isn’t a whole amount.',
  opening_date_invalid: 'Pick an opening date.',
  color_invalid: 'Pick a colour.',
  sort_order_invalid: 'Something went wrong with the order.',
};

/** The account to write, or the first validation error. Editing keeps id, sortOrder and createdAt. */
export function accountFromForm(
  form: AccountForm,
  currency: CurrencyCode,
  options: { readonly id: string; readonly now: string; readonly existing?: Account; readonly sortOrder: number },
): { account: Account } | { error: AccountValidationError } {
  const draft = draftFromForm(form, currency, options.existing?.sortOrder ?? options.sortOrder);
  const error = validateAccountDraft(draft);
  if (error) return { error };
  return {
    account: {
      ...draft,
      id: options.existing?.id ?? options.id,
      createdAt: options.existing?.createdAt ?? options.now,
      updatedAt: options.now,
      archivedAt: options.existing?.archivedAt ?? null,
    },
  };
}

/** Docs/18: Cash is suggested, never seeded silently. */
export function cashSuggestion(today: string): AccountForm {
  return { name: 'Cash', type: 'cash', last4: '', openingMinor: 0, openingOwed: false, openingDate: today, colorToken: 'lime' };
}

/** `AS OF 14:02`, in device-local time, for balances read from cache (docs/18 § Offline). */
export function asOfLabel(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `AS OF ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
