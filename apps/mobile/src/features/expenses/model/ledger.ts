/**
 * Ledger shaping: day groups, labels, search and recent usage. Pure, so the
 * ordering rules are tested without a device. See docs/03-expenses.md#the-ledger.
 */

import { type Category, type CurrencyCode, type Expense, type Money, add, addDays, money } from '@loop/shared';

export interface LedgerDay {
  readonly date: string;
  readonly total: Money;
  readonly expenses: readonly Expense[];
}

/** Newest day first; newest expense first within a day. Deleted expenses never appear. */
export function groupByDay(expenses: readonly Expense[], currency: CurrencyCode): LedgerDay[] {
  const days = new Map<string, Expense[]>();
  for (const expense of expenses) {
    if (expense.deletedAt !== null) continue;
    const bucket = days.get(expense.localDate) ?? [];
    bucket.push(expense);
    days.set(expense.localDate, bucket);
  }

  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, bucket]) => {
      const ordered = [...bucket].sort(
        (x, y) => y.occurredAt.localeCompare(x.occurredAt) || y.id.localeCompare(x.id),
      );
      return {
        date,
        expenses: ordered,
        total: ordered.reduce((sum, e) => add(sum, e.total), money(0, currency)),
      };
    });
}

export function dayLabel(date: string, today: string, locale = 'en-IN'): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Matches description, note, category name or tag, case-insensitively. */
export function searchExpenses(
  expenses: readonly Expense[],
  query: string,
  categoriesById: ReadonlyMap<string, Category>,
): Expense[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...expenses];
  return expenses.filter((expense) => {
    const category = categoriesById.get(expense.categoryId);
    return (
      expense.description.toLowerCase().includes(needle) ||
      (expense.note?.toLowerCase().includes(needle) ?? false) ||
      (category !== undefined &&
        (category.name.toLowerCase().includes(needle) || category.slug.toLowerCase().includes(needle)))
    );
  });
}

/** How often each category was used on or after `sinceDate` — the input `orderForEntry` takes. */
export function usageCounts(expenses: readonly Expense[], sinceDate: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.deletedAt !== null || expense.localDate < sinceDate) continue;
    counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1);
  }
  return counts;
}
