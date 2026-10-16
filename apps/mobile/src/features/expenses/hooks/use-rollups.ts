/**
 * Function-maintained daily rollups for past dates. docs/05-insights.md#data-sources:
 * a past period costs a handful of rollup reads instead of every expense in it.
 */

import { type DailyRollup, type Period } from '@loop/shared';
import { useEffect, useState } from 'react';

import { subscribeToDailyRollups, subscribeToLedgerVersion } from '@/features/expenses/api/rollup-repository';
import { useSession } from '@/core/providers/bootstrap-provider';

export type RollupsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly rollups: Readonly<Record<string, DailyRollup>>;
      /** From the offline cache with nothing in it: may simply never have been fetched. */
      readonly maybeUnfetched: boolean;
    }
  | { readonly status: 'error'; readonly message: string };

/** Daily rollups for [startDate, endDate), keyed by date. `null` range: nothing to fetch. */
export function useDailyRollups(range: Period | null): RollupsState {
  const { uid } = useSession();
  const [state, setState] = useState<RollupsState>({ status: range ? 'loading' : 'idle' });
  const start = range?.startDate;
  const end = range?.endDate;

  useEffect(() => {
    if (!start || !end) return setState({ status: 'idle' });
    setState({ status: 'loading' });
    return subscribeToDailyRollups(
      uid,
      { startDate: start, endDate: end },
      (snapshot) => setState({ status: 'ready', ...snapshot }),
      (error) => setState({ status: 'error', message: error.message }),
    );
  }, [uid, start, end]);

  return state;
}

/** The ledger version past-period numbers need: v1.2 rollups exist from 2 on. */
export const LEDGER_VERSION = 2;

export type LedgerSchemaState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly ledger: number; readonly updating: boolean }
  | { readonly status: 'error'; readonly message: string };

/**
 * Whether the v2 migration has reached this user. Clients never decide that a
 * migration ran (docs/27): while `ledger < 2`, past periods show "Updating your
 * history…" instead of numbers that might be wrong.
 */
export function useLedgerSchema(): LedgerSchemaState {
  const { uid } = useSession();
  const [state, setState] = useState<LedgerSchemaState>({ status: 'loading' });
  useEffect(
    () =>
      subscribeToLedgerVersion(
        uid,
        (ledger) => setState({ status: 'ready', ledger, updating: ledger < LEDGER_VERSION }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );
  return state;
}
