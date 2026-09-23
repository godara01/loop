import type { Expense, DailyRollup, MonthlyRollup } from './types';

export interface RollupDelta {
  readonly daily: Readonly<Record<string, DailyRollup>>;
  readonly monthly: Readonly<Record<string, MonthlyRollup>>;
}

export interface Rollups {
  readonly daily: Readonly<Record<string, DailyRollup>>;
  readonly monthly: Readonly<Record<string, MonthlyRollup>>;
}

function emptyDaily(): DailyRollup {
  return { totalMinor: 0, count: 0, byCategory: {} };
}

function emptyMonthly(): MonthlyRollup {
  return { ...emptyDaily(), byDay: {} };
}

function isLive(expense: Expense | null): expense is Expense {
  return expense !== null && expense.deletedAt === null;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function addContribution(
  delta: { daily: Record<string, DailyRollup>; monthly: Record<string, MonthlyRollup> },
  expense: Expense,
  direction: 1 | -1,
): void {
  const minor = expense.total.minor * direction;
  const count = direction;
  const day = delta.daily[expense.localDate] ?? emptyDaily();
  const monthKey = monthOf(expense.localDate);
  const month = delta.monthly[monthKey] ?? emptyMonthly();

  delta.daily[expense.localDate] = {
    totalMinor: day.totalMinor + minor,
    count: day.count + count,
    byCategory: {
      ...day.byCategory,
      [expense.categoryId]: (day.byCategory[expense.categoryId] ?? 0) + minor,
    },
  };
  delta.monthly[monthKey] = {
    totalMinor: month.totalMinor + minor,
    count: month.count + count,
    byCategory: {
      ...month.byCategory,
      [expense.categoryId]: (month.byCategory[expense.categoryId] ?? 0) + minor,
    },
    byDay: {
      ...month.byDay,
      [expense.localDate]: (month.byDay[expense.localDate] ?? 0) + minor,
    },
  };
}

export function rollupDelta(before: Expense | null, after: Expense | null): RollupDelta {
  const delta = { daily: {}, monthly: {} } as {
    daily: Record<string, DailyRollup>;
    monthly: Record<string, MonthlyRollup>;
  };

  if (isLive(before)) addContribution(delta, before, -1);
  if (isLive(after)) addContribution(delta, after, 1);

  return delta;
}

function applyCategories(
  categories: Readonly<Record<string, number>>,
  changes: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = { ...categories };
  for (const [categoryId, change] of Object.entries(changes)) {
    const value = (result[categoryId] ?? 0) + change;
    if (value <= 0) delete result[categoryId];
    else result[categoryId] = value;
  }
  return result;
}

function applyDays(days: Readonly<Record<string, number>>, changes: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const result: Record<string, number> = { ...days };
  for (const [date, change] of Object.entries(changes)) {
    const value = (result[date] ?? 0) + change;
    if (value <= 0) delete result[date];
    else result[date] = value;
  }
  return result;
}

export function applyDelta(rollup: MonthlyRollup, delta: MonthlyRollup): MonthlyRollup;
export function applyDelta(rollup: DailyRollup, delta: DailyRollup): DailyRollup;
export function applyDelta(rollup: DailyRollup | MonthlyRollup, delta: DailyRollup | MonthlyRollup): DailyRollup | MonthlyRollup {
  const totalMinor = Math.max(0, rollup.totalMinor + delta.totalMinor);
  const count = Math.max(0, rollup.count + delta.count);
  const byCategory = applyCategories(rollup.byCategory, delta.byCategory);

  if ('byDay' in rollup && 'byDay' in delta) {
    return { totalMinor, count, byCategory, byDay: applyDays(rollup.byDay, delta.byDay) };
  }
  return { totalMinor, count, byCategory };
}

export function buildRollups(expenses: readonly Expense[]): Rollups {
  const rollups = { daily: {}, monthly: {} } as {
    daily: Record<string, DailyRollup>;
    monthly: Record<string, MonthlyRollup>;
  };

  for (const expense of expenses) {
    if (!isLive(expense)) continue;
    const delta = rollupDelta(null, expense);
    for (const [date, change] of Object.entries(delta.daily)) {
      rollups.daily[date] = applyDelta(rollups.daily[date] ?? emptyDaily(), change);
    }
    for (const [month, change] of Object.entries(delta.monthly)) {
      rollups.monthly[month] = applyDelta(rollups.monthly[month] ?? emptyMonthly(), change);
    }
  }

  return rollups;
}
