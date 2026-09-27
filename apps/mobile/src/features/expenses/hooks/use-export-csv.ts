/**
 * You → Export CSV. Builds the file from the ledger's own source (live
 * expenses only; pending SMS items and soft-deleted rows never appear),
 * writes it to the cache directory and opens the system share sheet.
 */

import { buildExpensesCsv, todayISO } from '@loop/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import { fetchLiveExpenses } from '../api/expense-repository';

export type ExportState =
  | { readonly status: 'idle' }
  | { readonly status: 'exporting' }
  | { readonly status: 'done'; readonly count: number }
  | { readonly status: 'error'; readonly message: string };

export function useExportCsv(): { state: ExportState; exportCsv: () => Promise<void> } {
  const { uid } = useSession();
  const [state, setState] = useState<ExportState>({ status: 'idle' });

  const exportCsv = useCallback(async () => {
    setState({ status: 'exporting' });
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setState({ status: 'error', message: 'Sharing is not available on this device.' });
        return;
      }
      const expenses = await fetchLiveExpenses(uid);
      const file = new File(Paths.cache, `loop-expenses-${todayISO()}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(buildExpensesCsv(expenses));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export expenses',
        UTI: 'public.comma-separated-values-text',
      });
      setState({ status: 'done', count: expenses.filter((e) => e.deletedAt === null).length });
    } catch (error) {
      setState({ status: 'error', message: `Export failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [uid]);

  return { state, exportCsv };
}
