import { collection, doc, documentId, onSnapshot, query, where } from '@react-native-firebase/firestore';
import { type DailyRollup, type Period, firestorePaths } from '@loop/shared';

import { firebase } from '@/core/firebase/client';

type Unsubscribe = () => void;
type OnError = (error: Error) => void;

export interface RollupsSnapshot {
  readonly rollups: Readonly<Record<string, DailyRollup>>;
  readonly fromCache: boolean;
  readonly maybeUnfetched: boolean;
}

function isCategoryMap(value: unknown): value is Record<string, number> {
  return typeof value === 'object' && value !== null && Object.values(value).every((minor) => Number.isInteger(minor));
}

/**
 * A rollup doc, v1 or v2. The v2 buckets (refund, income) are optional; a
 * malformed one drops the whole day rather than half of it.
 */
function asRollup(data: unknown): DailyRollup | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (!Number.isInteger(d.totalMinor) || !Number.isInteger(d.count) || !isCategoryMap(d.byCategory)) return null;
  const v2: Record<string, unknown> = {};
  for (const field of ['refundCount', 'refundMinor', 'incomeCount', 'incomeMinor'] as const) {
    if (d[field] === undefined) continue;
    if (!Number.isInteger(d[field])) return null;
    v2[field] = d[field];
  }
  for (const field of ['refundByCategory', 'incomeByCategory'] as const) {
    if (d[field] === undefined) continue;
    if (!isCategoryMap(d[field])) return null;
    v2[field] = d[field];
  }
  return { totalMinor: d.totalMinor as number, count: d.count as number, byCategory: d.byCategory, ...v2 };
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

/**
 * `meta/schema.ledger`, written only by the migration script
 * (docs/27 § Migration script). A missing doc or field is ledger 1: the script
 * hasn't reached this user, so past periods can't be trusted yet.
 */
export function subscribeToLedgerVersion(uid: string, onChange: (ledger: number) => void, onError: OnError): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    doc(db, firestorePaths.metaSchema(uid)),
    (snapshot) => {
      const ledger = (snapshot.data() as Record<string, unknown> | undefined)?.ledger;
      onChange(Number.isInteger(ledger) ? (ledger as number) : 1);
    },
    (error) => onError(error instanceof Error ? error : new Error(String(error))),
  );
}
