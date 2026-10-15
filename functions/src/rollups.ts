import type * as admin from 'firebase-admin';
import {
  type ContributionRow,
  type CurrencyCode,
  type DailyRollup,
  type Expense,
  type FlowDelta,
  type MonthlyRollup,
  type TransactionKind,
  buildRollups,
  contributionsOf,
  effectOf,
  firestorePaths,
  isEmptyRollup,
  parseExpense,
} from '@loop/shared';

/**
 * Marker v2 at `rollupApplied/{expenseId}`: stores the exact vector this
 * document last contributed to rollups and accountBalances.
 */
interface MarkerV2 {
  readonly localDate: string;
  readonly kind: TransactionKind;
  readonly contributions: readonly ContributionRow[];
  readonly flows: readonly FlowDelta[];
}

/**
 * Legacy v1 marker shape. Treated as an equivalent v2 vector so existing data
 * converges without a migration.
 */
interface MarkerV1 {
  readonly localDate: string;
  readonly categoryId: string;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

function isMarkerV2(data: any): data is MarkerV2 {
  return (
    data &&
    typeof data.localDate === 'string' &&
    typeof data.kind === 'string' &&
    Array.isArray(data.contributions) &&
    Array.isArray(data.flows)
  );
}

function isMarkerV1(data: any): data is MarkerV1 {
  return (
    data &&
    typeof data.localDate === 'string' &&
    typeof data.categoryId === 'string' &&
    typeof data.amountMinor === 'number' &&
    typeof data.currency === 'string'
  );
}

/**
 * Convert a legacy v1 marker to an equivalent v2 vector, so existing data
 * converges without a migration.
 */
function v1ToV2(v1: MarkerV1): MarkerV2 {
  return {
    localDate: v1.localDate,
    kind: 'expense',
    contributions: [{ bucket: 'expense', categoryId: v1.categoryId, amountMinor: v1.amountMinor }],
    flows: [],
  };
}

/**
 * Parse the marker document. Returns null if the document doesn't exist or is
 * malformed (which means "no previous contribution").
 */
function parseMarker(data: admin.firestore.DocumentData | undefined): MarkerV2 | null {
  if (!data) return null;
  if (isMarkerV2(data)) return data;
  if (isMarkerV1(data)) return v1ToV2(data);
  return null;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function emptyDailyRollup(): DailyRollup {
  return {
    totalMinor: 0,
    count: 0,
    byCategory: {},
    refundCount: 0,
    refundMinor: 0,
    refundByCategory: {},
    incomeCount: 0,
    incomeMinor: 0,
    incomeByCategory: {},
  };
}

function emptyMonthlyRollup(): MonthlyRollup {
  return {
    totalMinor: 0,
    count: 0,
    byCategory: {},
    refundCount: 0,
    refundMinor: 0,
    refundByCategory: {},
    incomeCount: 0,
    incomeMinor: 0,
    incomeByCategory: {},
    byDay: {},
  };
}

/**
 * Compute the rollup delta from old and new marker vectors.
 * This is what we apply to rollups in the transaction.
 * Uses shared rollup maths via contributionsOf and applyContributionRows logic.
 */
function computeDeltaFromMarkers(
  oldMarker: MarkerV2 | null,
  newMarker: { localDate: string; contributions: readonly ContributionRow[] } | null,
): { daily: Record<string, DailyRollup>; monthly: Record<string, MonthlyRollup> } {
  // Use mutable objects internally, cast to readonly at the end
  const daily: Record<string, any> = {};
  const monthly: Record<string, any> = {};

  function getDaily(date: string) {
    if (!daily[date]) {
      daily[date] = {
        totalMinor: 0,
        count: 0,
        byCategory: {},
        refundCount: 0,
        refundMinor: 0,
        refundByCategory: {},
        incomeCount: 0,
        incomeMinor: 0,
        incomeByCategory: {},
      };
    }
    return daily[date];
  }

  function getMonthly(month: string) {
    if (!monthly[month]) {
      monthly[month] = {
        totalMinor: 0,
        count: 0,
        byCategory: {},
        refundCount: 0,
        refundMinor: 0,
        refundByCategory: {},
        incomeCount: 0,
        incomeMinor: 0,
        incomeByCategory: {},
        byDay: {},
      };
    }
    return monthly[month];
  }

  function applyContribs(
    date: string,
    contribs: readonly ContributionRow[],
    direction: 1 | -1,
  ): void {
    if (contribs.length === 0) return;

    const d = getDaily(date);
    const m = getMonthly(monthOf(date));

    for (const c of contribs) {
      const amt = c.amountMinor * direction;

      if (c.bucket === 'expense') {
        d.totalMinor += amt;
        d.count += direction;
        d.byCategory = { ...d.byCategory };
        d.byCategory[c.categoryId] = (d.byCategory[c.categoryId] ?? 0) + amt;

        m.totalMinor += amt;
        m.count += direction;
        m.byCategory = { ...m.byCategory };
        m.byCategory[c.categoryId] = (m.byCategory[c.categoryId] ?? 0) + amt;
        m.byDay = { ...m.byDay };
        m.byDay[date] = (m.byDay[date] ?? 0) + amt;
      } else if (c.bucket === 'refund') {
        d.refundMinor += amt;
        d.refundCount += direction;
        d.refundByCategory = { ...d.refundByCategory };
        d.refundByCategory[c.categoryId] = (d.refundByCategory[c.categoryId] ?? 0) + amt;

        m.refundMinor += amt;
        m.refundCount += direction;
        m.refundByCategory = { ...m.refundByCategory };
        m.refundByCategory[c.categoryId] = (m.refundByCategory[c.categoryId] ?? 0) + amt;
      } else if (c.bucket === 'income') {
        d.incomeMinor += amt;
        d.incomeCount += direction;
        d.incomeByCategory = { ...d.incomeByCategory };
        d.incomeByCategory[c.categoryId] = (d.incomeByCategory[c.categoryId] ?? 0) + amt;

        m.incomeMinor += amt;
        m.incomeCount += direction;
        m.incomeByCategory = { ...m.incomeByCategory };
        m.incomeByCategory[c.categoryId] = (m.incomeByCategory[c.categoryId] ?? 0) + amt;
      }
    }
  }

  // Subtract old contributions
  if (oldMarker) {
    applyContribs(oldMarker.localDate, oldMarker.contributions, -1);
  }

  // Add new contributions
  if (newMarker) {
    applyContribs(newMarker.localDate, newMarker.contributions, 1);
  }

  return { daily: daily as Record<string, DailyRollup>, monthly: monthly as Record<string, MonthlyRollup> };
}

/**
 * Update rollups and accountBalances for a single expense write.
 * Reads the expense doc and its marker in a transaction to handle
 * out-of-order and duplicate delivery.
 *
 * @param opts.skipImportCreate - if true, skip processing for import creates.
 *   This should only be true when `beforeData === null && afterData?.source === 'import'`.
 *   Other writes of import docs (edits, deletes after finalize) are processed normally.
 */
export async function updateRollups(
  db: FirebaseFirestore.Firestore,
  uid: string,
  expenseId: string,
  opts?: { skipImportCreate?: boolean },
): Promise<void> {
  const expenseRef = db.doc(firestorePaths.expense(uid, expenseId));
  const markerRef = db.doc(firestorePaths.rollupApplied(uid, expenseId));

  await db.runTransaction(async (txn) => {
    const expenseSnap = await txn.get(expenseRef);
    const markerSnap = await txn.get(markerRef);

    // Parse the expense doc. Malformed docs contribute nothing; never throw out
    // of the trigger. Skip 'import' source creates entirely if skipImportCreate is set.
    let currentExpense: Expense | null = null;
    if (expenseSnap.exists) {
      const data = expenseSnap.data();
      if (!data) {
        currentExpense = null;
      } else if (opts?.skipImportCreate && data.source === 'import') {
        // This is an import create - skip all rollup/flow/marker work.
        // finalizeImport will call rebuildUserLedger to bring them in.
        return;
      } else {
        try {
          currentExpense = parseExpense(uid, expenseId, data);
          if (currentExpense.deletedAt !== null) {
            currentExpense = null;
          }
        } catch {
          // Malformed expense: contribute nothing
          currentExpense = null;
        }
      }
    }

    const current = currentExpense ? contributionsOf(currentExpense) : null;
    const currentFlows = currentExpense ? effectOf(currentExpense) : [];

    const appliedMarker = parseMarker(markerSnap.data());
    const applied = appliedMarker;

    // If old == new, nothing to do
    if (
      applied &&
      current &&
      applied.localDate === current.localDate &&
      applied.kind === current.kind &&
      JSON.stringify(applied.contributions) === JSON.stringify(current.contributions) &&
      JSON.stringify(applied.flows) === JSON.stringify(currentFlows)
    ) {
      return;
    }

    // Compute rollup delta from markers
    const delta = computeDeltaFromMarkers(applied, current);

    // Extract flow deltas
    const oldFlows = applied?.flows ?? [];
    const newFlows = currentFlows;

    // Collect all touched dates and months
    const touchedDates = new Set<string>();
    const touchedMonths = new Set<string>();
    for (const date of Object.keys(delta.daily)) {
      touchedDates.add(date);
      touchedMonths.add(monthOf(date));
    }
    for (const month of Object.keys(delta.monthly)) {
      touchedMonths.add(month);
    }

    // ALSO include dates/months from old marker (for deletes where delta might only have negative)
    if (applied) {
      touchedDates.add(applied.localDate);
      touchedMonths.add(monthOf(applied.localDate));
    }

    // Read existing rollups for touched dates/months
    const existingDaily = new Map<string, DailyRollup>();
    const existingMonthly = new Map<string, MonthlyRollup>();

    for (const date of touchedDates) {
      const doc = await txn.get(db.doc(firestorePaths.dailyRollup(uid, date)));
      if (doc.exists) existingDaily.set(date, doc.data() as DailyRollup);
    }
    for (const month of touchedMonths) {
      const doc = await txn.get(db.doc(firestorePaths.monthlyRollup(uid, month)));
      if (doc.exists) existingMonthly.set(month, doc.data() as MonthlyRollup);
    }

    // Read existing account balances for all affected accounts
    const affectedAccountIds = new Set<string>();
    for (const flow of oldFlows) affectedAccountIds.add(flow.accountId);
    for (const flow of newFlows) affectedAccountIds.add(flow.accountId);
    const existingAccountBalances = new Map<string, number>();
    for (const accountId of affectedAccountIds) {
      const doc = await txn.get(db.doc(firestorePaths.accountBalance(uid, accountId)));
      if (doc.exists) {
        existingAccountBalances.set(accountId, doc.data()?.flowMinor ?? 0);
      }
    }

    // Apply delta to rollups manually (avoid applyRollupDelta issues)
    const updatedDaily: Record<string, DailyRollup> = {};
    for (const [date, rollup] of existingDaily) {
      updatedDaily[date] = rollup;
    }
    for (const [date, change] of Object.entries(delta.daily)) {
      const existing = updatedDaily[date] ?? emptyDailyRollup();
      updatedDaily[date] = {
        totalMinor: existing.totalMinor + (change.totalMinor ?? 0),
        count: existing.count + (change.count ?? 0),
        byCategory: mergeCategoryMap(existing.byCategory, change.byCategory ?? {}),
        refundCount: (existing.refundCount ?? 0) + (change.refundCount ?? 0),
        refundMinor: (existing.refundMinor ?? 0) + (change.refundMinor ?? 0),
        refundByCategory: mergeCategoryMap(existing.refundByCategory, change.refundByCategory ?? {}),
        incomeCount: (existing.incomeCount ?? 0) + (change.incomeCount ?? 0),
        incomeMinor: (existing.incomeMinor ?? 0) + (change.incomeMinor ?? 0),
        incomeByCategory: mergeCategoryMap(existing.incomeByCategory, change.incomeByCategory ?? {}),
      };
    }

    const updatedMonthly: Record<string, MonthlyRollup> = {};
    for (const [month, rollup] of existingMonthly) {
      updatedMonthly[month] = rollup;
    }
    for (const [month, change] of Object.entries(delta.monthly)) {
      const existing = updatedMonthly[month] ?? emptyMonthlyRollup();
      updatedMonthly[month] = {
        totalMinor: existing.totalMinor + (change.totalMinor ?? 0),
        count: existing.count + (change.count ?? 0),
        byCategory: mergeCategoryMap(existing.byCategory, change.byCategory ?? {}),
        refundCount: (existing.refundCount ?? 0) + (change.refundCount ?? 0),
        refundMinor: (existing.refundMinor ?? 0) + (change.refundMinor ?? 0),
        refundByCategory: mergeCategoryMap(existing.refundByCategory, change.refundByCategory ?? {}),
        incomeCount: (existing.incomeCount ?? 0) + (change.incomeCount ?? 0),
        incomeMinor: (existing.incomeMinor ?? 0) + (change.incomeMinor ?? 0),
        incomeByCategory: mergeCategoryMap(existing.incomeByCategory, change.incomeByCategory ?? {}),
        byDay: mergeCategoryMap(existing.byDay, change.byDay ?? {}),
      };
    }

    // Write updated rollups (delete if empty)
    for (const [date, rollup] of Object.entries(updatedDaily)) {
      const ref = db.doc(firestorePaths.dailyRollup(uid, date));
      if (isEmptyRollup(rollup)) {
        txn.delete(ref);
      } else {
        txn.set(ref, rollup);
      }
    }
    for (const [month, rollup] of Object.entries(updatedMonthly)) {
      const ref = db.doc(firestorePaths.monthlyRollup(uid, month));
      if (isEmptyRollup(rollup)) {
        txn.delete(ref);
      } else {
        txn.set(ref, rollup);
      }
    }

    // Compute account balance deltas: subtract old flows, add new flows
    const accountBalances: Record<string, number> = {};
    for (const flow of oldFlows) {
      accountBalances[flow.accountId] = (accountBalances[flow.accountId] ?? 0) - flow.deltaMinor;
    }
    for (const flow of newFlows) {
      accountBalances[flow.accountId] = (accountBalances[flow.accountId] ?? 0) + flow.deltaMinor;
    }

    // Write accountBalances (all reads done above, now writes)
    for (const [accountId, deltaMinor] of Object.entries(accountBalances)) {
      const ref = db.doc(firestorePaths.accountBalance(uid, accountId));
      const currentFlowMinor = existingAccountBalances.get(accountId) ?? 0;
      const newFlowMinor = currentFlowMinor + deltaMinor;
      txn.set(ref, { flowMinor: newFlowMinor }, { merge: true });
    }

    // Write or delete marker
    if (current && (current.contributions.length > 0 || newFlows.length > 0)) {
      txn.set(markerRef, {
        localDate: current.localDate,
        kind: current.kind,
        contributions: current.contributions,
        flows: newFlows,
      });
    } else {
      txn.delete(markerRef);
    }
  });
}

/**
 * Merge two category maps, adding values.
 */
function mergeCategoryMap(
  existing: Readonly<Record<string, number>> | undefined,
  change: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(change)) {
    result[key] = (result[key] ?? 0) + value;
    if (result[key] === 0) {
      delete result[key];
    }
  }
  return result;
}

/**
 * Rebuild rollups v2, accountBalances and markers from live transactions.
 *
 * @param db Firestore instance
 * @param uid User ID
 * @param span Optional date range. When provided:
 *   - Daily rollups are rebuilt only for dates in [from, to]
 *   - Monthly rollups are rebuilt for whole months 'YYYY-MM' from from.slice(0,7) to to.slice(0,7) inclusive
 *   - accountBalances are always rebuilt from ALL live transactions
 *   - Markers are rewritten for transactions in the daily range; markers outside the range are untouched
 * @returns Object with counts of expenses processed, daily rollups written, monthly rollups written.
 */
export async function rebuildUserLedger(
  db: FirebaseFirestore.Firestore,
  uid: string,
  span?: { from: string; to: string },
): Promise<{ expenses: number; daily: number; monthly: number }> {
  // Read all live transactions (including import source - finalizeImport calls this)
  const expensesSnap = await db.collection(firestorePaths.expenses(uid)).get();
  const live: Expense[] = [];

  for (const doc of expensesSnap.docs) {
    try {
      const expense = parseExpense(uid, doc.id, doc.data());
      if (expense.deletedAt === null) {
        live.push(expense);
      }
    } catch {
      // Skip malformed docs
    }
  }

  // Determine daily range and month range
  let dailyRange: { from: string; to: string } | null = null;
  let monthSet: Set<string> | null = null;

  if (span) {
    dailyRange = { from: span.from, to: span.to };
    // Build set of 'YYYY-MM' strings from from.slice(0,7) to to.slice(0,7) inclusive
    const fromMonth = span.from.slice(0, 7);
    const toMonth = span.to.slice(0, 7);
    monthSet = new Set<string>();
    let cur = fromMonth;
    while (cur <= toMonth) {
      monthSet.add(cur);
      // Increment month
      const [y, m] = cur.split('-').map(Number);
      let nextM = m + 1;
      let nextY = y;
      if (nextM > 12) {
        nextM = 1;
        nextY++;
      }
      cur = `${nextY}-${String(nextM).padStart(2, '0')}`;
    }
  }

  // 1. Daily: transactions in dailyRange
  const dailyTx = dailyRange
    ? live.filter((t) => t.localDate >= dailyRange.from && t.localDate <= dailyRange.to)
    : live;
  const dailyRollups = buildRollups(dailyTx).daily;

  // 2. Monthly: ALL transactions in the whole months (not just the span)
  const monthTx = monthSet
    ? live.filter((t) => monthSet.has(t.localDate.slice(0, 7)))
    : live;
  const monthlyRollups = buildRollups(monthTx).monthly;

  // 3. Account balances: from ALL live transactions
  const accountFlows: Record<string, number> = {};
  for (const expense of live) {
    const flows = effectOf(expense);
    for (const flow of flows) {
      accountFlows[flow.accountId] = (accountFlows[flow.accountId] ?? 0) + flow.deltaMinor;
    }
  }

  // Read existing accountBalances to find accounts that should be zeroed out
  const existingBalancesSnap = await db.collection(firestorePaths.accountBalances(uid)).get();
  const existingAccountIds = new Set(existingBalancesSnap.docs.map((d) => d.id));
  const recomputedAccountIds = new Set(Object.keys(accountFlows));

  // 4. Markers: target markers = for each t in dailyTx (same range as daily)
  // We'll build the target marker map first
  const targetMarkers = new Map<string, MarkerV2>();
  for (const expense of dailyTx) {
    const contributions = contributionsOf(expense);
    const flows = effectOf(expense);
    if (contributions.contributions.length > 0 || flows.length > 0) {
      targetMarkers.set(expense.id, {
        localDate: expense.localDate,
        kind: expense.kind ?? 'expense',
        contributions: contributions.contributions,
        flows,
      });
    }
  }

  // Read existing markers to determine what to delete
  const allMarkerDocs = await db.collection(`${firestorePaths.user(uid)}/rollupApplied`).get();
  const liveExpenseIds = new Set(live.map((e) => e.id));

  // 5. Writes: compute final state first, then for each doc in range:
  //    if in target → set (full overwrite); else if exists → delete
  const bulkWriter = db.bulkWriter();
  let dailyCount = 0;
  let monthlyCount = 0;

  // Daily rollups: determine which dates are in range
  const dailySnap = await db.collection(firestorePaths.dailyRollups(uid)).get();
  const dailyInRange = new Set<string>();
  for (const doc of dailySnap.docs) {
    if (dailyRange && (doc.id < dailyRange.from || doc.id > dailyRange.to)) continue;
    dailyInRange.add(doc.id);
  }
  // Also include dates that will be written
  for (const date of Object.keys(dailyRollups)) {
    if (dailyRange && (date < dailyRange.from || date > dailyRange.to)) continue;
    dailyInRange.add(date);
  }
  // Write/delete daily rollups in range
  for (const date of dailyInRange) {
    const ref = db.doc(firestorePaths.dailyRollup(uid, date));
    const rollup = dailyRollups[date];
    if (rollup && !isEmptyRollup(rollup)) {
      bulkWriter.set(ref, rollup);
      dailyCount++;
    } else {
      bulkWriter.delete(ref);
    }
  }

  // Monthly rollups: determine which months are in monthSet
  const monthlySnap = await db.collection(firestorePaths.monthlyRollups(uid)).get();
  const monthlyInRange = new Set<string>();
  for (const doc of monthlySnap.docs) {
    if (monthSet && !monthSet.has(doc.id)) continue;
    monthlyInRange.add(doc.id);
  }
  for (const month of Object.keys(monthlyRollups)) {
    if (monthSet && !monthSet.has(month)) continue;
    monthlyInRange.add(month);
  }
  // Write/delete monthly rollups in range
  for (const month of monthlyInRange) {
    const ref = db.doc(firestorePaths.monthlyRollup(uid, month));
    const rollup = monthlyRollups[month];
    if (rollup && !isEmptyRollup(rollup)) {
      bulkWriter.set(ref, rollup);
      monthlyCount++;
    } else {
      bulkWriter.delete(ref);
    }
  }

  // Account balances: write all recomputed, zero out stale
  for (const [accountId, flowMinor] of Object.entries(accountFlows)) {
    bulkWriter.set(db.doc(firestorePaths.accountBalance(uid, accountId)), { flowMinor });
  }
  for (const accountId of existingAccountIds) {
    if (!recomputedAccountIds.has(accountId)) {
      bulkWriter.set(db.doc(firestorePaths.accountBalance(uid, accountId)), { flowMinor: 0 });
    }
  }

  // Markers: determine which markers are in dailyRange
  const markersInRange = new Set<string>();
  for (const doc of allMarkerDocs.docs) {
    // Check if marker's stored localDate is in dailyRange
    const markerData = doc.data();
    const markerLocalDate = markerData?.localDate;
    if (dailyRange && markerLocalDate && (markerLocalDate < dailyRange.from || markerLocalDate > dailyRange.to)) {
      // Outside daily range - never touch
      continue;
    }
    markersInRange.add(doc.id);
  }
  // Also include target marker ids (they're all in dailyTx, so in dailyRange)
  for (const id of targetMarkers.keys()) {
    markersInRange.add(id);
  }

  // Write/delete markers in range
  for (const markerId of markersInRange) {
    const ref = db.doc(firestorePaths.rollupApplied(uid, markerId));
    const targetMarker = targetMarkers.get(markerId);
    if (targetMarker) {
      // In dailyTx: write the marker
      bulkWriter.set(ref, targetMarker);
    } else {
      // Not in dailyTx: delete only if (a) not in live at all, or (b) was in dailyRange but no longer in dailyTx
      const markerDoc = allMarkerDocs.docs.find((d) => d.id === markerId);
      const markerLocalDate = markerDoc?.data()?.localDate;
      const inLive = liveExpenseIds.has(markerId);
      const inDailyRange = dailyRange && markerLocalDate && markerLocalDate >= dailyRange.from && markerLocalDate <= dailyRange.to;
      if (!inLive || (inDailyRange && !dailyTx.some((t) => t.id === markerId))) {
        bulkWriter.delete(ref);
      }
      // Else: live expense outside dailyRange - leave untouched
    }
  }

  // Commit all writes
  await bulkWriter.close();

  return { expenses: dailyTx.length, daily: dailyCount, monthly: monthlyCount };
}

/**
 * Legacy wrapper for rebuildUserLedger. Used by the rebuildRollups callable.
 */
export async function rebuildUserRollups(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<{ expenses: number; daily: number; monthly: number }> {
  return rebuildUserLedger(db, uid);
}