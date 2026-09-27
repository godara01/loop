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
import type { DailyRollup } from './types';

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
  const weights = totals.map((t) => Math.abs(t.total.minor));
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
