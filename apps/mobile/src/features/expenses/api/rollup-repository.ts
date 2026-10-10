import { collection, documentId, onSnapshot, query, where } from '@react-native-firebase/firestore';
import { type DailyRollup, type Period, firestorePaths } from '@loop/shared';

import { firebase } from '@/core/firebase/client';

type Unsubscribe = () => void;
type OnError = (error: Error) => void;

export interface RollupsSnapshot {
  readonly rollups: Readonly<Record<string, DailyRollup>>;
  readonly fromCache: boolean;
  readonly maybeUnfetched: boolean;
}

function asRollup(data: unknown): DailyRollup | null {
  if (typeof data !== 'object' || data === null) return null;
  const { totalMinor, count, byCategory } = data as Record<string, unknown>;
  if (!Number.isInteger(totalMinor) || !Number.isInteger(count)) return null;
  if (typeof byCategory !== 'object' || byCategory === null) return null;
  return { totalMinor: totalMinor as number, count: count as number, byCategory: byCategory as Record<string, number> };
}

export function subscribeToDailyRollups(
  uid: string,
  range: Period,
  onChange: (snapshot: RollupsSnapshot) => void,
  onError: OnError,
): Unsubscribe {
  const { db } = firebase();
  const q = query(
    collection(db, `${firestorePaths.user(uid)}/dailyRollups`),
    where(documentId(), '>=', range.startDate),
    where(documentId(), '<', range.endDate),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rollups: Record<string, DailyRollup> = {};
      for (const doc of snapshot.docs) {
        const rollup = asRollup(doc.data());
        if (rollup) rollups[doc.id] = rollup;
      }
      onChange({
        rollups,
        fromCache: snapshot.metadata.fromCache,
        maybeUnfetched: snapshot.metadata.fromCache && snapshot.docs.length === 0,
      });
    },
    (error) => onError(error instanceof Error ? error : new Error(String(error))),
  );
}
