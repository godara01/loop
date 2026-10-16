/**
 * Category-wise and day-wise aggregation. See docs/05-insights.md.
 *
 * Everything here is a pure function over records, so the same code serves the
 * Insights screen, the rollup Cloud Function, and the MCP server later. Screens
 * do no arithmetic of their own.
 *
 * Two rules the tests hold to:
 *   - Totals are summed in integer minor units. Never a float, never a rounded
 *     intermediate.
 *   - Displayed percentages sum to exactly 100, by the same largest-remainder
 *     method that splits money. Independently rounding each share produces
 *     breakdowns that add to 99 or 101, which reads as a bug in the ledger.
 */

import { distributeLargestRemainder } from './internal/largest-remainder';
import { type CurrencyCode, type Money, money } from './money';
import type { DailyRollup, TransactionKind } from './types';

/** Half-open [startDate, endDate) over LOCAL dates. */
export interface Period {
  readonly startDate: string;
  readonly endDate: string;
}

export type PeriodKind = 'week' | 'month' | 'rolling30' | 'custom';

/**
 * The minimum an expense must expose to be aggregated. `Expense` satisfies it,
 * and so does a rollup row, so both feed the same functions.
 */
export interface SpendRecord {
  readonly localDate: string;
  readonly categoryId: string;
  readonly total: Money;
  readonly deletedAt?: string | null;
  // ——— v1.2, all optional so v1 records and v1 rollup rows still fit ———
  readonly id?: string;
  /** Absent means 'expense'. */
  readonly kind?: TransactionKind;
  /** Split lines. When present, the record counts per line instead of per `categoryId`. */
  readonly lines?: readonly { readonly categoryId: string; readonly amountMinor: number }[] | null;
  readonly refundOf?: string | null;
  /** Squad mirrors the user chose to keep out of their own numbers. */
  readonly excludeFromSpend?: boolean;
}

export interface CategoryTotal {
  readonly categoryId: string;
  readonly total: Money;
  readonly count: number;
  /** 0–1. Exact ratio for layout; use `displayPercentages` for printed numbers. */
  readonly share: number;
}

export interface DayTotal {
  readonly date: string;
  readonly total: Money;
  readonly count: number;
}

/**
 * The calendar's five deliberately discrete spend intensities. Zero is kept
 * separate so a no-spend day can be rendered as a positive, outlined cell.
 */
export function intensityStep(amountMinor: number, maximumMinor: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (amountMinor <= 0 || maximumMinor <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((amountMinor / maximumMinor) * 5))) as 1 | 2 | 3 | 4 | 5;
}

export interface Delta {
  readonly direction: 'up' | 'down' | 'flat';
  readonly absolute: Money;
  /** Null when the previous period was zero — there is no percentage of nothing. */
  readonly percent: number | null;
}

const DAY_MS = 86_400_000;

function parseDate(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`Invalid local date: ${date}`);
  return parsed;
}

function toISODate(ms: number): string {
  const iso = new Date(ms).toISOString();
  return iso.slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toISODate(parseDate(date) + days * DAY_MS);
}

export function periodLength(period: Period): number {
  return Math.max(0, Math.round((parseDate(period.endDate) - parseDate(period.startDate)) / DAY_MS));
}

/** Every date in the period, including the ones with no spending. */
export function daysInPeriod(period: Period): string[] {
  const days: string[] = [];
  for (let i = 0; i < periodLength(period); i += 1) {
    days.push(addDays(period.startDate, i));
  }
  return days;
}

export function isInPeriod(localDate: string, period: Period): boolean {
  return localDate >= period.startDate && localDate < period.endDate;
}

/** The standard periods behind the Insights control, anchored on a local today. */
export function periodOf(kind: PeriodKind, today: string): Period {
  const endDate = addDays(today, 1); // periods include today
  switch (kind) {
    case 'week':
      return { startDate: addDays(today, -6), endDate };
    case 'rolling30':
      return { startDate: addDays(today, -29), endDate };
    case 'month':
      return { startDate: `${today.slice(0, 7)}-01`, endDate };
    case 'custom':
      // Until a user supplies their saved dates, custom opens to a useful,
      // valid window rather than an empty or future range.
      return { startDate: addDays(today, -29), endDate };
  }
}

/** Validates the persisted custom range; end is exclusive like every Period. */
export function customPeriod(startDate: string, endDate: string, today: string): Period {
  const length = periodLength({ startDate, endDate });
  if (length < 1 || length > 366) throw new Error('Custom period must be between 1 and 366 days');
  if (endDate > addDays(today, 1)) throw new Error('Custom period cannot include future dates');
  return { startDate, endDate };
}

/**
 * Returns the saved custom period when both dates are set and valid, otherwise
 * falls back to periodOf('custom', today). Stored end date is EXCLUSIVE (Period is half-open).
 */
export function savedCustomPeriod(
  settings: { insightsCustomStartDate: string | null; insightsCustomEndDate: string | null },
  today: string,
): Period {
  if (!settings.insightsCustomStartDate || !settings.insightsCustomEndDate) {
    return periodOf('custom', today);
  }
  try {
    return customPeriod(settings.insightsCustomStartDate, settings.insightsCustomEndDate, today);
  } catch {
    return periodOf('custom', today);
  }
}

/** Moves a displayed window without ever manufacturing a future date. */
export function stepPeriod(period: Period, kind: PeriodKind, direction: -1 | 1, today: string): Period {
  if (direction === 1 && period.endDate >= addDays(today, 1)) return period;

  if (kind !== 'month') {
    const length = periodLength(period);
    const next = {
      startDate: addDays(period.startDate, direction * length),
      endDate: addDays(period.endDate, direction * length),
    };
    const currentEnd = addDays(today, 1);
    // For custom kind, never jump to the default last-30-days window.
    // If forward would pass today, return the period unchanged.
    if (kind === 'custom' && direction === 1 && next.endDate > currentEnd) {
      return period;
    }
    return next.endDate > currentEnd ? periodOf(kind, today) : next;
  }

  // A past month is a complete calendar month. Returning to the present uses
  // month-to-date, so the current view never includes days that have not happened.
  if (direction === 1) {
    const current = periodOf('month', today);
    if (period.endDate >= current.startDate) return current;
    const startDate = period.endDate;
    const following = addDays(startDate, 32);
    return { startDate, endDate: `${following.slice(0, 7)}-01` };
  }
  const previousMonthLastDay = addDays(period.startDate, -1);
  return {
    startDate: `${previousMonthLastDay.slice(0, 7)}-01`,
    endDate: `${period.startDate.slice(0, 7)}-01`,
  };
}

export function isCurrentPeriod(period: Period, today: string): boolean {
  return period.endDate >= addDays(today, 1);
}

/** The equivalent window immediately before this one, for delta comparison. */
export function previousPeriod(period: Period): Period {
  const length = periodLength(period);
  return {
    startDate: addDays(period.startDate, -length),
    endDate: period.startDate,
  };
}

function isLive(record: SpendRecord): boolean {
  return record.deletedAt === null || record.deletedAt === undefined;
}

function inScope(records: readonly SpendRecord[], period: Period): SpendRecord[] {
  return records.filter((r) => isLive(r) && isInPeriod(r.localDate, period));
}

export function periodTotal(
  records: readonly SpendRecord[],
  period: Period,
  currency: CurrencyCode,
): Money {
  let minor = 0;
  for (const record of inScope(records, period)) {
    minor += record.total.minor;
  }
  return money(minor, currency);
}

/** Descending by amount; ties break on categoryId so the order never flickers. */
export function totalsByCategory(
  records: readonly SpendRecord[],
  period: Period,
  currency: CurrencyCode,
): CategoryTotal[] {
  const scoped = inScope(records, period);

  const totals = new Map<string, { minor: number; count: number }>();
  let grandTotal = 0;

  for (const record of scoped) {
    const bucket = totals.get(record.categoryId) ?? { minor: 0, count: 0 };
    bucket.minor += record.total.minor;
    bucket.count += 1;
    totals.set(record.categoryId, bucket);
    grandTotal += record.total.minor;
  }

  return [...totals.entries()]
    .map(([categoryId, bucket]) => ({
      categoryId,
      total: money(bucket.minor, currency),
      count: bucket.count,
      share: grandTotal === 0 ? 0 : bucket.minor / grandTotal,
    }))
    .sort((a, b) => b.total.minor - a.total.minor || a.categoryId.localeCompare(b.categoryId));
}

/**
 * Every day in the period, contiguous, zero-spend days included. Gaps are
 * meaningful — a zero-spend day is a result, not missing data.
 */
export function totalsByDay(
  records: readonly SpendRecord[],
  period: Period,
  currency: CurrencyCode,
): DayTotal[] {
  const buckets = new Map<string, { minor: number; count: number }>();
  for (const record of inScope(records, period)) {
    const bucket = buckets.get(record.localDate) ?? { minor: 0, count: 0 };
    bucket.minor += record.total.minor;
    bucket.count += 1;
    buckets.set(record.localDate, bucket);
  }

  return daysInPeriod(period).map((date) => {
    const bucket = buckets.get(date);
    return {
      date,
      total: money(bucket?.minor ?? 0, currency),
      count: bucket?.count ?? 0,
    };
  });
}

/**
 * Whole percentages that sum to exactly 100 (or to 0 when there is nothing to
 * divide). Same method as money splitting, for the same reason.
 */
export function displayPercentages(totals: readonly CategoryTotal[]): number[] {
  // A net-refund category (total < 0) sits outside the 100% (docs/17 § Refunds
  // across periods): it gets 0 and the positive categories share all of 100.
  const weights = totals.map((t) => Math.max(0, t.total.minor));
  if (weights.length === 0) return [];
  if (weights.every((w) => w === 0)) return weights.map(() => 0);
  return distributeLargestRemainder(100, weights);
}

/** Down is the good direction in an expense tracker. The UI must not invert it. */
export function compareToPrevious(current: Money, previous: Money): Delta {
  const difference = current.minor - previous.minor;
  const direction = difference === 0 ? 'flat' : difference > 0 ? 'up' : 'down';

  return {
    direction,
    absolute: money(Math.abs(difference), current.currency),
    percent: previous.minor === 0 ? null : (difference / Math.abs(previous.minor)) * 100,
  };
}

export interface PeriodStats {
  readonly total: Money;
  readonly dailyAverage: Money;
  readonly busiestDay: DayTotal | null;
  readonly zeroSpendDays: number;
  readonly count: number;
}

export function periodStats(
  records: readonly SpendRecord[],
  period: Period,
  currency: CurrencyCode,
): PeriodStats {
  return statsFromDays(totalsByDay(records, period, currency), currency);
}

function statsFromDays(days: readonly DayTotal[], currency: CurrencyCode): PeriodStats {
  const total = days.reduce((sum, day) => sum + day.total.minor, 0);
  const count = days.reduce((sum, day) => sum + day.count, 0);

  let busiest: DayTotal | null = null;
  let zeroSpendDays = 0;
  for (const day of days) {
    if (day.total.minor === 0) zeroSpendDays += 1;
    if (busiest === null || day.total.minor > busiest.total.minor) busiest = day;
  }

  return {
    total: money(total, currency),
    // Averaged over elapsed days, so a mid-month view is not diluted by days
    // that have not happened yet.
    dailyAverage: money(days.length === 0 ? 0 : Math.round(total / days.length), currency),
    busiestDay: busiest !== null && busiest.count > 0 ? busiest : null,
    zeroSpendDays,
    count,
  };
}

/** Sunday-indexed average spend per weekday — answers "weekends wreck me". */
export function weekdayAverages(
  records: readonly SpendRecord[],
  period: Period,
  currency: CurrencyCode,
): Money[] {
  return weekdayAveragesFromDays(totalsByDay(records, period, currency), currency);
}

function weekdayAveragesFromDays(days: readonly DayTotal[], currency: CurrencyCode): Money[] {
  const sums = Array.from({ length: 7 }, () => 0);
  const counts = Array.from({ length: 7 }, () => 0);

  for (const day of days) {
    const weekday = new Date(parseDate(day.date)).getUTCDay();
    sums[weekday] = (sums[weekday] ?? 0) + day.total.minor;
    counts[weekday] = (counts[weekday] ?? 0) + 1;
  }

  return sums.map((sum, i) => {
    const divisor = counts[i] ?? 0;
    return money(divisor === 0 ? 0 : Math.round(sum / divisor), currency);
  });
}

/**
 * Categories under `threshold` of the total, collapsed into one row. This is a
 * UI grouping and never a data change — the real OTHER category is untouched.
 */
export function collapseLongTail(
  totals: readonly CategoryTotal[],
  threshold = 0.03,
): { readonly visible: CategoryTotal[]; readonly collapsed: CategoryTotal[] } {
  const visible: CategoryTotal[] = [];
  const collapsed: CategoryTotal[] = [];

  for (const total of totals) {
    (total.share < threshold ? collapsed : visible).push(total);
  }
  // One lonely small category is not a group; show it.
  return collapsed.length > 1 ? { visible, collapsed } : { visible: totals.slice(), collapsed: [] };
}

// ── Spend, Income, Net (v1.2) ─────────────────────────────────────────────
// docs/05-insights.md § Spend, Income, Net and docs/17 § Refunds.

export type InsightsView = 'spend' | 'income' | 'net';

/** One signed contribution of a record to a view's headline, keyed by category. */
interface ViewRow {
  readonly categoryId: string;
  readonly minor: number;
}

function linesOf(record: SpendRecord): readonly ViewRow[] {
  if (record.lines && record.lines.length > 0) {
    return record.lines.map((line) => ({ categoryId: line.categoryId, minor: line.amountMinor }));
  }
  return [{ categoryId: record.categoryId, minor: record.total.minor }];
}

/**
 * What a live, in-period record adds to a view. Spend is expense minus refund;
 * Income is income; Net is income minus spend, its rows keyed `in` and `out`.
 * Transfers, settlements, loans and excluded mirrors contribute nothing.
 */
function viewRows(record: SpendRecord, view: InsightsView): readonly ViewRow[] {
  if (record.excludeFromSpend === true) return [];
  const kind = record.kind ?? 'expense';
  const sign = kind === 'expense' ? 1 : kind === 'refund' ? -1 : 0;
  if (view === 'spend') {
    return sign === 0 ? [] : linesOf(record).map((row) => ({ categoryId: row.categoryId, minor: sign * row.minor }));
  }
  if (view === 'income') return kind === 'income' ? linesOf(record) : [];
  if (kind === 'income') return [{ categoryId: 'in', minor: record.total.minor }];
  if (sign === 0) return [];
  const spent = linesOf(record).reduce((sum, row) => sum + row.minor, 0);
  return [{ categoryId: 'out', minor: -sign * spent }];
}

function isOriginal(record: SpendRecord): boolean {
  return isLive(record) && record.id !== undefined && (record.kind ?? 'expense') === 'expense';
}

/**
 * Caps the refunds of each original at the original's amount, so two offline
 * devices refunding the same purchase never push spend below zero
 * (docs/17 § When two offline devices over-refund). Refunds are taken in
 * `localDate`, then `id` order; the one that crosses the cap keeps the
 * remainder and later ones become 0. Only applies when the original is among
 * `records` — rollups store raw sums. Returns a same-length array in the same
 * order, with copies for changed records; the input is never mutated.
 */
export function clampRefunds<T extends SpendRecord>(records: readonly T[]): T[] {
  const capById = new Map<string, number>();
  for (const record of records) {
    if (isOriginal(record)) capById.set(record.id as string, record.total.minor);
  }

  const refundIndexes = new Map<string, number[]>();
  records.forEach((record, index) => {
    if (record.kind !== 'refund' || !isLive(record) || !record.refundOf || !capById.has(record.refundOf)) return;
    const list = refundIndexes.get(record.refundOf) ?? [];
    list.push(index);
    refundIndexes.set(record.refundOf, list);
  });

  const clampedAmount = new Map<number, number>();
  for (const [originalId, indexes] of refundIndexes) {
    indexes.sort((a, b) => {
      const left = records[a] as T;
      const right = records[b] as T;
      return left.localDate.localeCompare(right.localDate) || (left.id ?? '').localeCompare(right.id ?? '') || a - b;
    });
    let room = capById.get(originalId) ?? 0;
    for (const index of indexes) {
      const amount = (records[index] as T).total.minor;
      const kept = Math.max(0, Math.min(amount, room));
      room -= kept;
      if (kept !== amount) clampedAmount.set(index, kept);
    }
  }

  return records.map((record, index) => {
    const kept = clampedAmount.get(index);
    if (kept === undefined) return record;
    const lines =
      record.lines && record.lines.length > 0
        ? kept === 0
          ? record.lines.map((line) => ({ ...line, amountMinor: 0 }))
          : distributeLargestRemainder(kept, record.lines.map((line) => Math.abs(line.amountMinor))).map((amountMinor, i) => ({
              ...(record.lines as NonNullable<T['lines']>)[i]!,
              amountMinor,
            }))
        : record.lines;
    return { ...record, total: money(kept, record.total.currency), lines };
  });
}

function viewTotal(records: readonly SpendRecord[], period: Period, view: InsightsView): number {
  let minor = 0;
  for (const record of inScope(clampRefunds(records), period)) {
    for (const row of viewRows(record, view)) minor += row.minor;
  }
  return minor;
}

/** Expense minus refund for the period. Cash-basis, so it can be negative. */
export function periodSpend(records: readonly SpendRecord[], period: Period, currency: CurrencyCode): Money {
  return money(viewTotal(records, period, 'spend'), currency);
}

export function periodIncome(records: readonly SpendRecord[], period: Period, currency: CurrencyCode): Money {
  return money(viewTotal(records, period, 'income'), currency);
}

/** Income minus spend, with its sign. */
export function periodNet(records: readonly SpendRecord[], period: Period, currency: CurrencyCode): Money {
  return money(viewTotal(records, period, 'net'), currency);
}

type Buckets = Map<string, { minor: number; count: number }>;

function addBucket(map: Buckets, key: string, minor: number, count: number): void {
  const bucket = map.get(key) ?? { minor: 0, count: 0 };
  bucket.minor += minor;
  bucket.count += count;
  map.set(key, bucket);
}

/**
 * Category rows from buckets: zero rows dropped, shares over the positive rows
 * only (a net-refund row has share 0), largest first, ties by id.
 */
function categoryRows(buckets: Buckets, currency: CurrencyCode): CategoryTotal[] {
  const rows = [...buckets.entries()].filter(([, bucket]) => bucket.minor !== 0);
  const positive = rows.reduce((sum, [, bucket]) => sum + Math.max(0, bucket.minor), 0);
  return rows
    .map(([categoryId, bucket]) => ({
      categoryId,
      total: money(bucket.minor, currency),
      count: bucket.count,
      share: positive === 0 || bucket.minor <= 0 ? 0 : bucket.minor / positive,
    }))
    .sort((a, b) => b.total.minor - a.total.minor || a.categoryId.localeCompare(b.categoryId));
}

/**
 * Net per category for Spend (expense lines add, refund lines subtract, so a
 * category can be negative) or Income. A split record counts once in each
 * category it touches.
 */
export function totalsByCategoryForKind(
  records: readonly SpendRecord[],
  period: Period,
  view: 'spend' | 'income',
  currency: CurrencyCode,
): CategoryTotal[] {
  const buckets: Buckets = new Map();
  for (const record of inScope(clampRefunds(records), period)) {
    const rows = viewRows(record, view);
    for (const row of rows) addBucket(buckets, row.categoryId, row.minor, 0);
    for (const categoryId of new Set(rows.map((row) => row.categoryId))) addBucket(buckets, categoryId, 0, 1);
  }
  return categoryRows(buckets, currency);
}

/** Every day in the period with that day's spend, income or net. `count` is the records counted. */
export function totalsByDayForView(
  records: readonly SpendRecord[],
  period: Period,
  view: InsightsView,
  currency: CurrencyCode,
): DayTotal[] {
  const buckets: Buckets = new Map();
  for (const record of inScope(clampRefunds(records), period)) {
    const rows = viewRows(record, view);
    if (rows.length === 0) continue;
    addBucket(buckets, record.localDate, rows.reduce((sum, row) => sum + row.minor, 0), 1);
  }
  return daysInPeriod(period).map((date) => {
    const bucket = buckets.get(date);
    return { date, total: money(bucket?.minor ?? 0, currency), count: bucket?.count ?? 0 };
  });
}

/** The delta chip's colour meaning per view: less spend is good, more income or net is good. */
export function deltaTone(view: InsightsView, delta: Delta): 'good' | 'bad' | 'neutral' {
  if (delta.direction === 'flat') return 'neutral';
  const goodDirection = view === 'spend' ? 'down' : 'up';
  return delta.direction === goodDirection ? 'good' : 'bad';
}

// ── Rollups + cache ───────────────────────────────────────────────────────

/**
 * Where a period's numbers come from. docs/05-insights.md#data-sources: past
 * days read the Function-maintained daily rollups (a handful of document reads
 * instead of thousands of expenses); the current month reads the offline cache.
 */
export interface PeriodSources {
  readonly period: Period;
  readonly currency: CurrencyCode;
  /** Local dates before this come from `rollups`; this date onward from `cached`. */
  readonly cacheFrom: string;
  /** Daily rollup docs by date. A missing date is a zero-spend day (empty rollups are deleted). */
  readonly rollups: Readonly<Record<string, DailyRollup>>;
  readonly cached: readonly SpendRecord[];
}

export interface PeriodInsights {
  readonly total: Money;
  readonly totals: CategoryTotal[];
  readonly days: DayTotal[];
  readonly stats: PeriodStats;
  readonly weekdays: Money[];
  /**
   * Rollups keep a count per day but not per category. When any rollup day is
   * in the period, `CategoryTotal.count` covers only the cached days and this
   * is false. Every amount, share, day count and `stats.count` stays exact.
   */
  readonly categoryCountsExact: boolean;
}

/**
 * The Insights outputs for a period whose past days come from rollups and whose
 * recent days come from cached expenses. Equal, to the minor unit, to computing
 * the same period from the expenses alone.
 */
export function mergePeriodSources(sources: PeriodSources): PeriodInsights {
  const { period, currency, cacheFrom, rollups, cached } = sources;
  const dayBuckets = new Map<string, { minor: number; count: number }>();
  const categoryBuckets = new Map<string, { minor: number; count: number }>();
  let usedRollups = false;

  const addTo = (map: Map<string, { minor: number; count: number }>, key: string, minor: number, count: number) => {
    const bucket = map.get(key) ?? { minor: 0, count: 0 };
    bucket.minor += minor;
    bucket.count += count;
    map.set(key, bucket);
  };

  for (const date of daysInPeriod(period)) {
    if (date >= cacheFrom) continue;
    usedRollups = true;
    const rollup = rollups[date];
    if (!rollup) continue;
    addTo(dayBuckets, date, rollup.totalMinor, rollup.count);
    for (const [categoryId, minor] of Object.entries(rollup.byCategory)) addTo(categoryBuckets, categoryId, minor, 0);
  }

  for (const record of inScope(cached, period)) {
    if (record.localDate < cacheFrom) continue;
    addTo(dayBuckets, record.localDate, record.total.minor, 1);
    addTo(categoryBuckets, record.categoryId, record.total.minor, 1);
  }

  const days = daysInPeriod(period).map((date) => {
    const bucket = dayBuckets.get(date);
    return { date, total: money(bucket?.minor ?? 0, currency), count: bucket?.count ?? 0 };
  });
  const grandTotal = days.reduce((sum, day) => sum + day.total.minor, 0);
  const totals = [...categoryBuckets.entries()]
    .filter(([, bucket]) => bucket.minor !== 0)
    .map(([categoryId, bucket]) => ({
      categoryId,
      total: money(bucket.minor, currency),
      count: bucket.count,
      share: grandTotal === 0 ? 0 : bucket.minor / grandTotal,
    }))
    .sort((a, b) => b.total.minor - a.total.minor || a.categoryId.localeCompare(b.categoryId));

  return {
    total: money(grandTotal, currency),
    totals,
    days,
    stats: statsFromDays(days, currency),
    weekdays: weekdayAveragesFromDays(days, currency),
    categoryCountsExact: !usedRollups,
  };
}

/** What a v2 daily rollup adds to a view: the day's amount, record count and category rows. */
function rollupView(rollup: DailyRollup, view: InsightsView): { minor: number; count: number; rows: ViewRow[] } {
  const spendRows = (): ViewRow[] => {
    const net = new Map<string, number>();
    for (const [categoryId, minor] of Object.entries(rollup.byCategory)) net.set(categoryId, (net.get(categoryId) ?? 0) + minor);
    for (const [categoryId, minor] of Object.entries(rollup.refundByCategory ?? {})) net.set(categoryId, (net.get(categoryId) ?? 0) - minor);
    return [...net.entries()].map(([categoryId, minor]) => ({ categoryId, minor }));
  };
  const spend = rollup.totalMinor - (rollup.refundMinor ?? 0);
  const spendCount = rollup.count + (rollup.refundCount ?? 0);
  const income = rollup.incomeMinor ?? 0;
  const incomeCount = rollup.incomeCount ?? 0;

  if (view === 'spend') return { minor: spend, count: spendCount, rows: spendRows() };
  if (view === 'income') {
    return { minor: income, count: incomeCount, rows: Object.entries(rollup.incomeByCategory ?? {}).map(([categoryId, minor]) => ({ categoryId, minor })) };
  }
  return { minor: income - spend, count: spendCount + incomeCount, rows: [{ categoryId: 'in', minor: income }, { categoryId: 'out', minor: -spend }] };
}

/**
 * `mergePeriodSources` for one Spend / Income / Net view. Past days read the
 * v2 rollup buckets (a v1 rollup reads as expense-only); recent days read the
 * cached docs, with over-refunds clamped. Equal, to the minor unit, to
 * computing the same period from the documents alone (absent over-refunds,
 * which rollups store raw).
 *
 * In the Net view the category rows are `in` (income) and `out` (spend), both
 * as positive-when-normal amounts so the two bars read naturally.
 */
export function mergePeriodSourcesForView(sources: PeriodSources, view: InsightsView): PeriodInsights {
  const { period, currency, cacheFrom, rollups, cached } = sources;
  const dayBuckets: Buckets = new Map();
  const categoryBuckets: Buckets = new Map();
  let usedRollups = false;

  for (const date of daysInPeriod(period)) {
    if (date >= cacheFrom) continue;
    usedRollups = true;
    const rollup = rollups[date];
    if (!rollup) continue;
    const day = rollupView(rollup, view);
    addBucket(dayBuckets, date, day.minor, day.count);
    for (const row of day.rows) addBucket(categoryBuckets, row.categoryId, row.minor, 0);
  }

  for (const record of inScope(clampRefunds(cached), period)) {
    if (record.localDate < cacheFrom) continue;
    const rows = viewRows(record, view);
    if (rows.length === 0) continue;
    addBucket(dayBuckets, record.localDate, rows.reduce((sum, row) => sum + row.minor, 0), 1);
    for (const row of rows) addBucket(categoryBuckets, row.categoryId, row.minor, 0);
    for (const categoryId of new Set(rows.map((row) => row.categoryId))) addBucket(categoryBuckets, categoryId, 0, 1);
  }

  if (view === 'net') {
    const out = categoryBuckets.get('out');
    if (out) out.minor = -out.minor;
  }

  const days = daysInPeriod(period).map((date) => {
    const bucket = dayBuckets.get(date);
    return { date, total: money(bucket?.minor ?? 0, currency), count: bucket?.count ?? 0 };
  });
  return {
    total: money(days.reduce((sum, day) => sum + day.total.minor, 0), currency),
    totals: categoryRows(categoryBuckets, currency),
    days,
    stats: statsFromDays(days, currency),
    weekdays: weekdayAveragesFromDays(days, currency),
    categoryCountsExact: !usedRollups,
  };
}
