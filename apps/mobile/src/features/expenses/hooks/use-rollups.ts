/**
 * Function-maintained daily rollups for past dates. docs/05-insights.md#data-sources:
 * a past period costs a handful of rollup reads instead of every expense in it.
 */

import { collection, documentId, onSnapshot, query, where } from '@react-native-firebase/firestore';
import { type DailyRollup, type Period, firestorePaths } from '@loop/shared';
import { useEffect, useState } from 'react';

import { firebase } from '@/core/firebase/client';
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

function asRollup(data: unknown): DailyRollup | null {
  if (typeof data !== 'object' || data === null) return null;
  const { totalMinor, count, byCategory } = data as Record<string, unknown>;
  if (!Number.isInteger(totalMinor) || !Number.isInteger(count)) return null;
  if (typeof byCategory !== 'object' || byCategory === null) return null;
  return { totalMinor: totalMinor as number, count: count as number, byCategory: byCategory as Record<string, number> };
}

/** Daily rollups for [startDate, endDate), keyed by date. `null` range: nothing to fetch. */
export function useDailyRollups(range: Period | null): RollupsState {
  const { uid } = useSession();
  const [state, setState] = useState<RollupsState>({ status: range ? 'loading' : 'idle' });
  const start = range?.startDate;
  const end = range?.endDate;

  useEffect(() => {
    if (!start || !end) return setState({ status: 'idle' });
    setState({ status: 'loading' });
    const { db } = firebase();
    // Rollup doc ids are the local dates themselves, so a document-id range is the date range.
    const q = query(
      collection(db, `${firestorePaths.user(uid)}/dailyRollups`),
      where(documentId(), '>=', start),
      where(documentId(), '<', end),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const rollups: Record<string, DailyRollup> = {};
        for (const doc of snapshot.docs) {
          const rollup = asRollup(doc.data());
          if (rollup) rollups[doc.id] = rollup;
        }
        setState({
          status: 'ready',
          rollups,
          maybeUnfetched: snapshot.metadata.fromCache && snapshot.docs.length === 0,
        });
      },
      (error) => setState({ status: 'error', message: error.message }),
    );
  }, [uid, start, end]);

  return state;
}
