import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Expense, money, newPersonalExpense, seedEssentialCategories, softDeleteExpense } from '@loop/shared';

import { dayLabel, groupByDay, searchExpenses, usageCounts } from './ledger';

const NOW = '2026-09-16T12:00:00.000Z';
const categories = seedEssentialCategories(NOW);
const byId = new Map(categories.map((c) => [c.id, c]));

const make = (id: string, minor: number, occurredAt: string, categoryId = 'cat-food', description = id): Expense => ({
  ...newPersonalExpense({
    id,
    uid: 'u',
    total: money(minor, 'INR'),
    categoryId,
    description,
    note: null,
    occurredAt,
    now: NOW,
  }),
  // Pin the day so the test does not depend on the machine's timezone.
  localDate: occurredAt.slice(0, 10),
});

const EXPENSES = [
  make('a', 12000, '2026-09-16T04:00:00.000Z', 'cat-food', 'Filter coffee'),
  make('b', 50000, '2026-09-16T09:00:00.000Z', 'cat-transport', 'Cab home'),
  make('c', 30000, '2026-09-15T09:00:00.000Z', 'cat-groceries', 'Vegetables'),
];

describe('grouping by day', () => {
  it('orders days newest first and expenses newest first within a day', () => {
    const days = groupByDay(EXPENSES, 'INR');
    assert.deepEqual(days.map((d) => d.date), ['2026-09-16', '2026-09-15']);
    assert.deepEqual(days[0]!.expenses.map((e) => e.id), ['b', 'a']);
  });

  it('totals each day exactly', () => {
    assert.equal(groupByDay(EXPENSES, 'INR')[0]!.total.minor, 62000);
  });

  it('drops deleted expenses, and a day left empty disappears', () => {
    const withDeleted = [...EXPENSES.slice(0, 2), softDeleteExpense(EXPENSES[2]!, NOW)];
    assert.deepEqual(groupByDay(withDeleted, 'INR').map((d) => d.date), ['2026-09-16']);
  });
});

describe('day labels', () => {
  it('names today and yesterday', () => {
    assert.equal(dayLabel('2026-09-16', '2026-09-16'), 'Today');
    assert.equal(dayLabel('2026-09-15', '2026-09-16'), 'Yesterday');
  });

  it('dates anything older, independent of the device timezone', () => {
    assert.match(dayLabel('2026-09-10', '2026-09-16'), /10/);
  });
});

describe('search', () => {
  it('matches description, category name and tag, ignoring case', () => {
    assert.deepEqual(searchExpenses(EXPENSES, 'COFFEE', byId).map((e) => e.id), ['a']);
    assert.deepEqual(searchExpenses(EXPENSES, 'transport', byId).map((e) => e.id), ['b']);
    assert.deepEqual(searchExpenses(EXPENSES, 'grocer', byId).map((e) => e.id), ['c']);
  });

  it('returns everything for an empty query', () => {
    assert.equal(searchExpenses(EXPENSES, '   ', byId).length, 3);
  });
});

describe('usage counts', () => {
  it('counts only the window, ignoring deleted expenses', () => {
    const counts = usageCounts([...EXPENSES, softDeleteExpense(make('d', 1, '2026-09-16T10:00:00.000Z'), NOW)], '2026-09-16');
    assert.equal(counts.get('cat-food'), 1);
    assert.equal(counts.get('cat-transport'), 1);
    assert.equal(counts.has('cat-groceries'), false);
  });
});
