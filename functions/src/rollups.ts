import type * as admin from 'firebase-admin';
import {
  type CurrencyCode,
  type DailyRollup,
  type Expense,
  type MonthlyRollup,
  applyRollupDelta,
  firestorePaths,
  rollupDelta,
} from '@loop/shared';

/**
 * What one expense currently adds to the rollups. The server-only marker at
 * `rollupApplied/{expenseId}` holds the contribution last applied, so each run
 * applies (marker → current) and a replayed trigger computes a zero delta.
 */
interface Contribution {
  readonly localDate: string;
  readonly categoryId: string;
  readonly minor: number;
  readonly currency: CurrencyCode;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function rollupMarkerPath(uid: string, expenseId: string): string {
  return `${firestorePaths.user(uid)}/rollupApplied/${expenseId}`;
}

/**
 * A live, well-formed expense contributes; anything else contributes nothing.
 * The security rules already guarantee these fields on client writes, and a
 * rollup is always rebuildable from the expenses, so a malformed document is
 * left out rather than failing the trigger (and the coin logic after it).
 */
function contributionOf(data: admin.firestore.DocumentData | undefined): Contribution | null {
  if (!data || data.deletedAt != null) return null;
  const { localDate, categoryId, amountMinor, currency } = data;
  if (typeof localDate !== 'string' || !LOCAL_DATE.test(localDate)) return null;
  if (typeof categoryId !== 'string' || categoryId === '') return null;
  if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor <= 0) return null;
  return { localDate, categoryId, minor: amountMinor, currency: typeof currency === 'string' ? currency : 'INR' } as Contribution;
}

function sameContribution(a: Contribution | null, b: Contribution | null): boolean {
  if (a === null || b === null) return a === b;
  return a.localDate === b.localDate && a.categoryId === b.categoryId && a.minor === b.minor && a.currency === b.currency;
}

/** The rollup maths takes whole expenses; only these fields feed it. */
function asExpense(c: Contribution | null): Expense | null {
  if (c === null) return null;
  return {
    id: '',
    categoryId: c.categoryId,
    total: { minor: c.minor, currency: c.currency },
    description: '',
    note: null,
    occurredAt: '',
    localDate: c.localDate,
    source: 'manual',
    receiptPath: null,
    pendingId: null,
    groupId: null,
    paidBy: '',
    splitMode: 'even',
    allocations: [],
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };
}

/**
 * Bring the rollups in line with the expense as it is NOW. Triggers are
 * at-least-once and may arrive out of order, so the event payload is not
 * trusted: the expense doc is re-read inside the transaction. A stale or
 * duplicate event therefore converges on the same state as the latest one.
 *
 * All reads happen before any write, as Firestore transactions require.
 */
export async function updateRollups(db: admin.firestore.Firestore, uid: string, expenseId: string): Promise<void> {
  const expenseRef = db.doc(firestorePaths.expense(uid, expenseId));
  const markerRef = db.doc(rollupMarkerPath(uid, expenseId));

  await db.runTransaction(async (txn) => {
    const [expenseSnap, markerSnap] = await txn.getAll(expenseRef, markerRef);
    const current = contributionOf(expenseSnap.data());
    const applied = contributionOf(markerSnap.data());
    if (sameContribution(applied, current)) return;

    const delta = rollupDelta(asExpense(applied), asExpense(current));
    const dailyRefs = Object.keys(delta.daily).map((date) => db.doc(`${firestorePaths.user(uid)}/dailyRollups/${date}`));
    const monthlyRefs = Object.keys(delta.monthly).map((month) =>
      db.doc(`${firestorePaths.user(uid)}/monthlyRollups/${month}`),
    );
    const snaps = await txn.getAll(...dailyRefs, ...monthlyRefs);

    const daily: Record<string, DailyRollup> = {};
    const monthly: Record<string, MonthlyRollup> = {};
    dailyRefs.forEach((ref, i) => {
      const data = snaps[i]!.data();
      if (data) daily[ref.id] = data as DailyRollup;
    });
    monthlyRefs.forEach((ref, i) => {
      const data = snaps[dailyRefs.length + i]!.data();
      if (data) monthly[ref.id] = data as MonthlyRollup;
    });

    // applyRollupDelta drops a rollup whose count reaches zero; a missing key
    // in the result means delete the doc.
    const next = applyRollupDelta({ daily, monthly }, delta);
    for (const ref of dailyRefs) {
      const rollup = next.daily[ref.id];
      if (rollup) txn.set(ref, rollup);
      else txn.delete(ref);
    }
    for (const ref of monthlyRefs) {
      const rollup = next.monthly[ref.id];
      if (rollup) txn.set(ref, rollup);
      else txn.delete(ref);
    }

    if (current) {
      txn.set(markerRef, {
        localDate: current.localDate,
        categoryId: current.categoryId,
        amountMinor: current.minor,
        currency: current.currency,
      });
    } else {
      txn.delete(markerRef);
    }
  });
}
