import type { Expense, DailyRollup, MonthlyRollup, TransactionKind } from './types';

export interface RollupDelta {
  readonly daily: Readonly<Record<string, DailyRollup>>;
  readonly monthly: Readonly<Record<string, MonthlyRollup>>;
}

export interface Rollups {
  readonly daily: Readonly<Record<string, DailyRollup>>;
  readonly monthly: Readonly<Record<string, MonthlyRollup>>;
}

export interface FlowDelta {
  readonly accountId: string;
  readonly deltaMinor: number;
}

export interface ContributionRow {
  readonly bucket: 'expense' | 'refund' | 'income';
  readonly categoryId: string;
  readonly amountMinor: number;
}

export interface TxContributions {
  readonly localDate: string;
  readonly kind: TransactionKind;
  readonly excludeFromSpend: boolean;
  readonly contributions: readonly ContributionRow[];
  readonly flows: readonly FlowDelta[];
}

function emptyDaily(): DailyRollup {
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

function emptyMonthly(): MonthlyRollup {
  return { ...emptyDaily(), byDay: {} };
}

function isLive(expense: Expense | null): expense is Expense {
  if (expense === null) return false;
  if (expense.deletedAt !== null && expense.deletedAt !== undefined) return false;
  return true;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function asCategoryMap(map: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> {
  return map ?? {};
}

export function contributionsOf(tx: Expense): TxContributions {
  const kind: TransactionKind = tx.kind ?? 'expense';
  const excludeFromSpend = tx.excludeFromSpend ?? false;
  const localDate = tx.localDate;
  const contributions: ContributionRow[] = [];

  const lines = tx.lines && tx.lines.length > 0 ? tx.lines : null;

  // Squad mirrors with excludeFromSpend add nothing to the buckets
  // (docs/11-firebase.md#rollups-v2); their account flows below still apply.
  if (excludeFromSpend) {
    // no bucket contributions
  } else if (kind === 'expense') {
    if (lines) {
      for (const line of lines) {
        const cat = line.categoryId;
        const amt = line.amountMinor;
        if (cat && amt !== 0) {
          contributions.push({ bucket: 'expense', categoryId: cat, amountMinor: amt });
        }
      }
    } else {
      const cat = tx.categoryId;
      const amt = tx.total?.minor ?? 0;
      if (cat && amt !== 0) {
        contributions.push({ bucket: 'expense', categoryId: cat, amountMinor: amt });
      }
    }
  } else if (kind === 'refund') {
    if (lines) {
      for (const line of lines) {
        const cat = line.categoryId;
        const amt = line.amountMinor;
        if (cat && amt !== 0) {
          contributions.push({ bucket: 'refund', categoryId: cat, amountMinor: amt });
        }
      }
    } else {
      const cat = tx.categoryId;
      const amt = tx.total?.minor ?? 0;
      if (cat && amt !== 0) {
        contributions.push({ bucket: 'refund', categoryId: cat, amountMinor: amt });
      }
    }
  } else if (kind === 'income') {
    if (lines) {
      for (const line of lines) {
        const cat = line.categoryId;
        const amt = line.amountMinor;
        if (cat && amt !== 0) {
          contributions.push({ bucket: 'income', categoryId: cat, amountMinor: amt });
        }
      }
    } else {
      const cat = tx.categoryId;
      const amt = tx.total?.minor ?? 0;
      if (cat && amt !== 0) {
        contributions.push({ bucket: 'income', categoryId: cat, amountMinor: amt });
      }
    }
  } else {
    // transfer, settlement, loan — excluded from spend buckets per spec
    // no contributions to rollup buckets
  }

  const flows: FlowDelta[] = [];
  const totalMinor = tx.total?.minor ?? 0;

  if (kind === 'expense') {
    if (tx.accountId) {
      flows.push({ accountId: tx.accountId, deltaMinor: -totalMinor });
    }
  } else if (kind === 'income') {
    if (tx.accountId) {
      flows.push({ accountId: tx.accountId, deltaMinor: totalMinor });
    }
  } else if (kind === 'refund') {
    if (tx.accountId) {
      flows.push({ accountId: tx.accountId, deltaMinor: totalMinor });
    }
  } else if (kind === 'transfer') {
    if (tx.accountId && tx.toAccountId && tx.accountId !== tx.toAccountId) {
      flows.push({ accountId: tx.accountId, deltaMinor: -totalMinor });
      flows.push({ accountId: tx.toAccountId, deltaMinor: totalMinor });
    }
  } else if (kind === 'settlement' || kind === 'loan') {
    if (tx.accountId) {
      const dir = tx.direction;
      if (dir === 'in') {
        flows.push({ accountId: tx.accountId, deltaMinor: totalMinor });
      } else if (dir === 'out') {
        flows.push({ accountId: tx.accountId, deltaMinor: -totalMinor });
      } else {
        flows.push({ accountId: tx.accountId, deltaMinor: -totalMinor });
      }
    }
  }

  return {
    localDate,
    kind,
    excludeFromSpend,
    contributions,
    flows,
  };
}
function applyContributionRows(
  daily: Record<string, DailyRollup>,
  monthly: Record<string, MonthlyRollup>,
  localDate: string,
  contribs: readonly ContributionRow[],
  direction: 1 | -1,
): void {
  if (contribs.length === 0) return;
  const day = daily[localDate] ?? emptyDaily();
  const monthKey = monthOf(localDate);
  const month = monthly[monthKey] ?? emptyMonthly();

  const nextDay: Record<string, any> = { ...day };
  const nextMonth: Record<string, any> = { ...month };

  const hasExpense = contribs.some((c) => c.bucket === 'expense');
  if (hasExpense) {
    nextDay.totalMinor = (nextDay.totalMinor ?? 0) + contribs.filter((c) => c.bucket === 'expense').reduce((s, c) => s + c.amountMinor, 0) * direction;
    nextDay.count = (nextDay.count ?? 0) + direction;
    nextMonth.totalMinor = (nextMonth.totalMinor ?? 0) + contribs.filter((c) => c.bucket === 'expense').reduce((s, c) => s + c.amountMinor, 0) * direction;
    nextMonth.count = (nextMonth.count ?? 0) + direction;
    const mByDay = { ...(nextMonth.byDay ?? {}) };
    const totalExp = contribs.filter((c) => c.bucket === 'expense').reduce((s, c) => s + c.amountMinor, 0) * direction;
    mByDay[localDate] = (mByDay[localDate] ?? 0) + totalExp;
    nextMonth.byDay = mByDay;
  }
  for (const c of contribs) {
    const amt = c.amountMinor * direction;
    if (c.bucket === 'expense') {
      const byCat = { ...(nextDay.byCategory ?? {}) };
      byCat[c.categoryId] = (byCat[c.categoryId] ?? 0) + amt;
      nextDay.byCategory = byCat;
      const mByCat = { ...(nextMonth.byCategory ?? {}) };
      mByCat[c.categoryId] = (mByCat[c.categoryId] ?? 0) + amt;
      nextMonth.byCategory = mByCat;
    } else if (c.bucket === 'refund') {
      nextDay.refundMinor = (nextDay.refundMinor ?? 0) + amt;
      nextDay.refundCount = (nextDay.refundCount ?? 0) + direction;
      const rByCat = { ...(nextDay.refundByCategory ?? {}) };
      rByCat[c.categoryId] = (rByCat[c.categoryId] ?? 0) + amt;
      nextDay.refundByCategory = rByCat;

      nextMonth.refundMinor = (nextMonth.refundMinor ?? 0) + amt;
      nextMonth.refundCount = (nextMonth.refundCount ?? 0) + direction;
      const mrByCat = { ...(nextMonth.refundByCategory ?? {}) };
      mrByCat[c.categoryId] = (mrByCat[c.categoryId] ?? 0) + amt;
      nextMonth.refundByCategory = mrByCat;
    } else if (c.bucket === 'income') {
      nextDay.incomeMinor = (nextDay.incomeMinor ?? 0) + amt;
      nextDay.incomeCount = (nextDay.incomeCount ?? 0) + direction;
      const iByCat = { ...(nextDay.incomeByCategory ?? {}) };
      iByCat[c.categoryId] = (iByCat[c.categoryId] ?? 0) + amt;
      nextDay.incomeByCategory = iByCat;

      nextMonth.incomeMinor = (nextMonth.incomeMinor ?? 0) + amt;
      nextMonth.incomeCount = (nextMonth.incomeCount ?? 0) + direction;
      const miByCat = { ...(nextMonth.incomeByCategory ?? {}) };
      miByCat[c.categoryId] = (miByCat[c.categoryId] ?? 0) + amt;
      nextMonth.incomeByCategory = miByCat;
    }
  }

  daily[localDate] = nextDay as DailyRollup;
  monthly[monthKey] = nextMonth as MonthlyRollup;
}
function addContribution(
  delta: { daily: Record<string, DailyRollup>; monthly: Record<string, MonthlyRollup> },
  expense: Expense,
  direction: 1 | -1,
): void {
  const c = contributionsOf(expense);
  applyContributionRows(delta.daily, delta.monthly, c.localDate, c.contributions, direction);
}
export function rollupDelta(before: Expense | null, after: Expense | null): RollupDelta {
  const delta = { daily: {} as Record<string, DailyRollup>, monthly: {} as Record<string, MonthlyRollup> };

  if (isLive(before) && !isLive(after)) {
    addContribution(delta, before, -1);
    return delta;
  }
  if (!isLive(before) && isLive(after)) {
    addContribution(delta, after, 1);
    return delta;
  }
  if (isLive(before) && isLive(after)) {
    // compute delta by removing before and adding after
    const cBefore = contributionsOf(before);
    const cAfter = contributionsOf(after);
    if (cBefore.localDate !== cAfter.localDate) {
      applyContributionRows(delta.daily, delta.monthly, cBefore.localDate, cBefore.contributions, -1);
      applyContributionRows(delta.daily, delta.monthly, cAfter.localDate, cAfter.contributions, 1);
      return delta;
    }
    // same date: subtract before contributions, add after contributions
    applyContributionRows(delta.daily, delta.monthly, cBefore.localDate, cBefore.contributions, -1);
    applyContributionRows(delta.daily, delta.monthly, cAfter.localDate, cAfter.contributions, 1);
    return delta;
  }
  return { daily: {}, monthly: {} };
}
export function applyDelta(rollup: MonthlyRollup, delta: MonthlyRollup): MonthlyRollup;
export function applyDelta(rollup: DailyRollup, delta: DailyRollup): DailyRollup;
export function applyDelta(rollup: DailyRollup | MonthlyRollup, delta: DailyRollup | MonthlyRollup): DailyRollup | MonthlyRollup {
  const r = rollup as Record<string, any>;
  const d = delta as Record<string, any>;
  const next: Record<string, any> = { ...r };

  next.totalMinor = (r.totalMinor ?? 0) + (d.totalMinor ?? 0);
  next.count = (r.count ?? 0) + (d.count ?? 0);
  next.byCategory = mergeMaps(asCategoryMap(r.byCategory), asCategoryMap(d.byCategory));

  next.refundMinor = (r.refundMinor ?? 0) + (d.refundMinor ?? 0);
  next.refundCount = (r.refundCount ?? 0) + (d.refundCount ?? 0);
  next.refundByCategory = mergeMaps(asCategoryMap(r.refundByCategory), asCategoryMap(d.refundByCategory));

  next.incomeMinor = (r.incomeMinor ?? 0) + (d.incomeMinor ?? 0);
  next.incomeCount = (r.incomeCount ?? 0) + (d.incomeCount ?? 0);
  next.incomeByCategory = mergeMaps(asCategoryMap(r.incomeByCategory), asCategoryMap(d.incomeByCategory));

  if ('byDay' in r || 'byDay' in d) {
    next.byDay = mergeMaps(asCategoryMap((r as any).byDay), asCategoryMap((d as any).byDay));
  }
  return next as DailyRollup | MonthlyRollup;
}

function mergeMaps(base: Readonly<Record<string, number>>, deltaMap: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const [k, v] of Object.entries(deltaMap)) {
    out[k] = (out[k] ?? 0) + v;
  }
  for (const k of Object.keys(out)) {
    if (out[k] === 0) {
      delete out[k];
    }
  }
  return out;
}
export function buildRollups(expenses: readonly Expense[]): Rollups {
  const rollups: Rollups = { daily: {} as Record<string, DailyRollup>, monthly: {} as Record<string, MonthlyRollup> };
  for (const expense of expenses) {
    if (!isLive(expense)) continue;
    const delta = rollupDelta(null, expense);
    const changeDaily = delta.daily;
    const changeMonthly = delta.monthly;
    for (const [date, change] of Object.entries(changeDaily)) {
      (rollups.daily as Record<string,DailyRollup>)[date] = applyDelta(rollups.daily[date] ?? emptyDaily(), change as DailyRollup);
    }
    for (const [month, change] of Object.entries(changeMonthly)) {
      (rollups.monthly as Record<string,MonthlyRollup>)[month] = applyDelta(rollups.monthly[month] ?? emptyMonthly(), change as MonthlyRollup);
    }
  }
  return rollups;
}
export function isEmptyRollup(r: DailyRollup | MonthlyRollup): boolean {
  const countTotal = (r.count ?? 0) + (r.refundCount ?? 0) + (r.incomeCount ?? 0);
  return countTotal === 0;
}

export function applyRollupDelta(rollups: Rollups, delta: RollupDelta): Rollups {
  const daily: Record<string, DailyRollup> = { ...rollups.daily };
  const monthly: Record<string, MonthlyRollup> = { ...rollups.monthly };

  for (const [date, change] of Object.entries(delta.daily)) {
    const next = applyDelta(daily[date] ?? emptyDaily(), change as DailyRollup);
    if (isEmptyRollup(next)) {
      delete daily[date];
    } else {
      daily[date] = next;
    }
  }
  for (const [month, change] of Object.entries(delta.monthly)) {
    const next = applyDelta(monthly[month] ?? emptyMonthly(), change as MonthlyRollup);
    if (isEmptyRollup(next)) {
      delete monthly[month];
    } else {
      monthly[month] = next;
    }
  }
  return { daily, monthly };
}

export function applyContributionDelta(
  rollups: Rollups,
  flows: readonly FlowDelta[],
  oldTx: Expense | null,
  newTx: Expense | null,
): Rollups {
  const d = rollupDelta(oldTx, newTx);
  return applyRollupDelta(rollups, d);
}
