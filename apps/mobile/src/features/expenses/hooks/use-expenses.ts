import { type Expense, type Period, addDays, todayISO } from '@loop/shared';
import { useEffect, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import {
  type ExpensesSnapshot,
  observeExpense,
  observeExpensesInRange,
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

/** The ledger pages normally, but Insight drill-downs must use their exact range. */
export function useLedgerExpenses(pageSize: number, period: Period | null): ExpensesState {
  const { uid } = useSession();
  const [state, setState] = useState<ExpensesState>({ status: 'loading' });
  useEffect(() => {
    const onChange = (snapshot: ExpensesSnapshot) => setState({ status: 'ready', snapshot });
    const onError = (error: Error) => setState({ status: 'error', message: error.message });
    return period
      ? observeExpensesInRange(uid, period.startDate, period.endDate, onChange, onError)
      : observeRecentExpenses(uid, pageSize, onChange, onError);
  }, [uid, pageSize, period?.startDate, period?.endDate]);
  return state;
}

/** A bounded live query for an Insights period. */
export function useExpensesForPeriod(period: Period): ExpensesState {
  const { uid } = useSession();
  const [state, setState] = useState<ExpensesState>({ status: 'loading' });
  useEffect(
    () =>
      observeExpensesInRange(
        uid,
        period.startDate,
        period.endDate,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid, period.startDate, period.endDate],
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
