import type * as admin from 'firebase-admin';
import {
  type CurrencyCode,
  type DailyRollup,
  type Expense,
  type MonthlyRollup,
  applyRollupDelta,
  buildRollups,
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

export interface RebuildResult {
  readonly expenses: number;
  readonly daily: number;
  readonly monthly: number;
}

/**
 * Regenerate a user's rollups from their expenses. docs/11-firebase.md: a
 * rollup is derived data, and if it ever disagrees with the expenses, the
 * expenses win.
 *
 * The `rollupApplied` markers are rewritten too, so the next `onExpenseWrite`
 * computes its delta from what the rebuilt rollups actually contain.
 *
 * Not transactional — a user can have more expenses than one transaction may
 * touch. An expense written mid-rebuild is corrected by running it again.
 */
export async function rebuildUserRollups(db: admin.firestore.Firestore, uid: string): Promise<RebuildResult> {
  const userPath = firestorePaths.user(uid);
  const [expenses, daily, monthly, markers] = await Promise.all([
    db.collection(firestorePaths.expenses(uid)).get(),
    db.collection(`${userPath}/dailyRollups`).get(),
    db.collection(`${userPath}/monthlyRollups`).get(),
    db.collection(`${userPath}/rollupApplied`).get(),
  ]);

  const contributions = new Map<string, Contribution>();
  for (const doc of expenses.docs) {
    const contribution = contributionOf(doc.data());
    if (contribution) contributions.set(doc.id, contribution);
  }
  const rollups = buildRollups([...contributions.values()].map((c) => asExpense(c)!));

  const writer = db.bulkWriter();
  for (const doc of daily.docs) if (!(doc.id in rollups.daily)) void writer.delete(doc.ref);
  for (const doc of monthly.docs) if (!(doc.id in rollups.monthly)) void writer.delete(doc.ref);
  for (const [date, rollup] of Object.entries(rollups.daily)) {
    void writer.set(db.doc(`${userPath}/dailyRollups/${date}`), rollup);
  }
  for (const [month, rollup] of Object.entries(rollups.monthly)) {
    void writer.set(db.doc(`${userPath}/monthlyRollups/${month}`), rollup);
  }
  for (const doc of markers.docs) if (!contributions.has(doc.id)) void writer.delete(doc.ref);
  for (const [expenseId, c] of contributions) {
    void writer.set(db.doc(rollupMarkerPath(uid, expenseId)), {
      localDate: c.localDate,
      categoryId: c.categoryId,
      amountMinor: c.minor,
      currency: c.currency,
    });
  }
  await writer.close();

  return {
    expenses: contributions.size,
    daily: Object.keys(rollups.daily).length,
    monthly: Object.keys(rollups.monthly).length,
  };
}
