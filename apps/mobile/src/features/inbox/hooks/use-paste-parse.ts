/**
 * Paste-to-parse: a bank message the user copied, read by the same parser as
 * auto-capture. Works on every platform — it never touches the SMS reader.
 *
 * The pasted text lives only in the sheet's state and in this call; it is
 * parsed and dropped. Only the draft (no body) is written.
 */

import { useCallback, useMemo } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';
import { useExpensesForLastDays } from '@/features/expenses';

import { createPendingExpense, newPendingExpenseId } from '../api/pending-expenses-repository';
import { ingestMessage } from '../model/ingest';
import { usePendingExpenses } from './use-pending-expenses';

export type PasteResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export const PASTE_UNREADABLE = "Loop couldn't find a new bank debit in that message.";

const logWriteFailure = (error: unknown) => console.warn('[inbox] pending write rejected', error);

export function usePasteParse(): (text: string) => PasteResult {
  const { uid } = useSession();
  const pending = usePendingExpenses();
  // Hand-typed expenses from the last two days: enough to cover the ±30 min dedupe window.
  const recent = useExpensesForLastDays(2);

  const existingPending = useMemo(() => (pending.status === 'ready' ? pending.snapshot.items : []), [pending]);
  const existingManual = useMemo(
    () =>
      recent.status === 'ready'
        ? recent.snapshot.expenses.map((e) => ({ amountMinor: e.total.minor, occurredAt: e.occurredAt, source: e.source }))
        : [],
    [recent],
  );

  return useCallback(
    (text: string): PasteResult => {
      if (text.trim() === '') return { ok: false, message: 'Paste a bank message first.' };
      const now = new Date().toISOString();
      // Pasting is the user's own action, so the auto-capture kill switch does not apply.
      const draft = ingestMessage(
        { body: text, sender: null, receivedAt: now },
        { enabled: true, source: 'pasted', existingPending, existingManual, now },
      );
      if (!draft) return { ok: false, message: PASTE_UNREADABLE };
      createPendingExpense(uid, { id: newPendingExpenseId(uid), ...draft }).catch(logWriteFailure);
      return { ok: true };
    },
    [uid, existingPending, existingManual],
  );
}
