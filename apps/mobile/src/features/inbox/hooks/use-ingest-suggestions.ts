import { useMemo } from 'react';

import { useAccounts } from '@/features/accounts/hooks/use-accounts';
import { useCategories } from '@/features/categories';
import type { ExpensesState } from '@/features/expenses/hooks/use-expenses';

import type { IngestContext } from '../model/ingest';

/** docs/17 § Refund matching: candidates are live expenses from the last 60 days. */
export const REFUND_WINDOW_DAYS = 60;

/** What ingest v2 needs to make its suggestions (docs/12, docs/17, docs/18). */
export function useIngestSuggestions(recent: ExpensesState): Pick<IngestContext, 'accounts' | 'categories' | 'refundCandidates'> {
  const accounts = useAccounts();
  const categories = useCategories();
  return useMemo(
    () => ({
      accounts: accounts.status === 'ready' ? accounts.snapshot.accounts : [],
      categories: categories.status === 'ready' ? categories.snapshot.categories : [],
      refundCandidates:
        recent.status === 'ready' ? recent.snapshot.expenses.filter((e) => e.deletedAt === null && (e.kind ?? 'expense') === 'expense') : [],
    }),
    [accounts, categories, recent],
  );
}
