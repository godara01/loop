import { type Account, type Expense, type Money, accountBalance } from '@loop/shared';
import { useEffect, useMemo, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import {
  type AccountBalancesSnapshot,
  type AccountsSnapshot,
  fetchMarkerFlows,
  observeAccountBalances,
  observeAccounts,
} from '../api/account-repository';

export type AccountsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: AccountsSnapshot }
  | { readonly status: 'error'; readonly message: string };

/** The signed-in user's accounts, live, from the offline cache first. */
export function useAccounts(): AccountsState {
  const { uid } = useSession();
  const [state, setState] = useState<AccountsState>({ status: 'loading' });
  useEffect(
    () =>
      observeAccounts(
        uid,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );
  return state;
}

export interface AccountWithBalance {
  readonly account: Account;
  readonly balance: Money;
}

export type AccountBalancesState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly balances: readonly AccountWithBalance[];
      /** Set while the balances come from cache: the time of the last server snapshot (`AS OF 14:02`). */
      readonly asOf: string | null;
    }
  | { readonly status: 'error'; readonly message: string };

/**
 * Every account with its balance: opening + server flow + the local delta of
 * documents with pending writes (docs/18 § The balance). `pendingDocs` are the
 * caller's cached expenses whose ids are in `pendingIds`; their markers are
 * read so an offline edit or delete is exact.
 */
export function useAccountBalances(pendingDocs: readonly Expense[]): AccountBalancesState {
  const { uid } = useSession();
  const accounts = useAccounts();
  const [balances, setBalances] = useState<AccountBalancesSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<Readonly<Record<string, readonly { accountId: string; deltaMinor: number }[]>>>({});

  useEffect(
    () => observeAccountBalances(uid, setBalances, (failure) => setError(failure.message)),
    [uid],
  );

  const pendingKey = pendingDocs.map((tx) => tx.id).sort().join(',');
  useEffect(() => {
    if (pendingKey === '') return setMarkers({});
    let cancelled = false;
    fetchMarkerFlows(uid, pendingKey.split(','))
      .then((result) => {
        if (!cancelled) setMarkers(result);
      })
      // Offline with nothing cached: treat as no markers (new documents), the common case.
      .catch(() => {
        if (!cancelled) setMarkers({});
      });
    return () => {
      cancelled = true;
    };
  }, [uid, pendingKey]);

  return useMemo<AccountBalancesState>(() => {
    if (error) return { status: 'error', message: error };
    if (accounts.status === 'error') return accounts;
    if (accounts.status === 'loading' || balances === null) return { status: 'loading' };
    return {
      status: 'ready',
      balances: accounts.snapshot.accounts.map((account) => ({
        account,
        balance: accountBalance(
          account.openingBalance,
          balances.flows.get(account.id) ?? { accountId: account.id, deltaMinor: 0 },
          pendingDocs,
          markers,
        ),
      })),
      asOf: balances.fromCache ? balances.serverAsOf : null,
    };
  }, [accounts, balances, error, markers, pendingDocs]);
}
