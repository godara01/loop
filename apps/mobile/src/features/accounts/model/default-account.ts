/**
 * The entry sheet's default account (docs/18 § Entry sheet integration): the
 * account last used for this kind, unless it was archived or deleted, in which
 * case None. Never a guess.
 */

import type { Account, AccountChoiceKind } from '@loop/shared';

export function defaultAccountId(
  kind: AccountChoiceKind,
  lastAccountByKind: Readonly<Partial<Record<AccountChoiceKind, string>>> | undefined,
  accounts: readonly Account[],
): string | null {
  const last = lastAccountByKind?.[kind];
  if (!last) return null;
  const account = accounts.find((candidate) => candidate.id === last);
  return account && account.archivedAt === null ? account.id : null;
}

/** The account row shows only once the user has an active account. */
export function showAccountRow(accounts: readonly Account[]): boolean {
  return accounts.some((account) => account.archivedAt === null);
}

/** The settings patch that remembers this choice; unchanged choices write nothing. */
export function rememberAccount(
  kind: AccountChoiceKind,
  accountId: string | null,
  lastAccountByKind: Readonly<Partial<Record<AccountChoiceKind, string>>> | undefined,
): Partial<Record<AccountChoiceKind, string>> | null {
  const current = lastAccountByKind?.[kind] ?? null;
  if (current === accountId) return null;
  const next: Partial<Record<AccountChoiceKind, string>> = { ...lastAccountByKind };
  if (accountId === null) delete next[kind];
  else next[kind] = accountId;
  return next;
}
