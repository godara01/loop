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

/** Half-open [startDate, endDate) over LOCAL dates. */
export interface Period {
  readonly startDate: string;
  readonly endDate: string;
}

export type PeriodKind = 'week' | 'month' | 'rolling30';

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
  }
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
  const days = totalsByDay(records, period, currency);
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
  const sums = Array.from({ length: 7 }, () => 0);
  const counts = Array.from({ length: 7 }, () => 0);

  for (const day of totalsByDay(records, period, currency)) {
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
