import { type Expense, addDays, todayISO } from '@loop/shared';
import { useEffect, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import {
  type ExpensesSnapshot,
  observeExpense,
  observeExpensesSince,
  observeRecentExpenses,
} from '../api/expense-repository';

export type ExpensesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: ExpensesSnapshot }
  | { readonly status: 'error'; readonly message: string };

export function useRecentExpenses(pageSize: number): ExpensesState {
  const { uid } = useSession();
  const [state, setState] = useState<ExpensesState>({ status: 'loading' });
  useEffect(
    () =>
      observeRecentExpenses(
        uid,
        pageSize,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid, pageSize],
  );
  return state;
}

/** Live expenses from `days - 1` days ago through today. `days = 1` is today only. */
export function useExpensesForLastDays(days: number): ExpensesState {
  const { uid } = useSession();
  const since = addDays(todayISO(), -(days - 1));
  const [state, setState] = useState<ExpensesState>({ status: 'loading' });
  useEffect(
    () =>
      observeExpensesSince(
        uid,
        since,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid, since],
  );
  return state;
}

export type ExpenseState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly expense: Expense }
  | { readonly status: 'missing' }
  | { readonly status: 'error'; readonly message: string };

export function useExpense(expenseId: string | undefined): ExpenseState {
  const { uid } = useSession();
  const [state, setState] = useState<ExpenseState>({ status: 'loading' });
  useEffect(() => {
    if (!expenseId) return setState({ status: 'missing' });
    return observeExpense(
      uid,
      expenseId,
      (expense) => setState(expense ? { status: 'ready', expense } : { status: 'missing' }),
      (error) => setState({ status: 'error', message: error.message }),
    );
  }, [uid, expenseId]);
  return state;
}
