import { useEffect, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import { type PendingExpensesSnapshot, listenPendingExpenses } from '../api/pending-expenses-repository';

export type PendingExpensesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: PendingExpensesSnapshot }
  | { readonly status: 'error'; readonly message: string };

/** The inbox, live, from the offline cache first. */
export function usePendingExpenses(): PendingExpensesState {
  const { uid } = useSession();
  const [state, setState] = useState<PendingExpensesState>({ status: 'loading' });

  useEffect(
    () =>
      listenPendingExpenses(
        uid,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );

  return state;
}
