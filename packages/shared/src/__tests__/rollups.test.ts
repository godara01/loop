import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { periodTotal } from '../insights';
import { money } from '../money';
import { applyDelta, applyRollupDelta, buildRollups, rollupDelta, type Rollups } from '../rollups';
import type { Expense } from '../types';

const INR = 'INR' as const;
const NOW = '2026-09-23T10:00:00.000Z';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    categoryId: 'food',
    total: money(1200, INR),
    description: 'Coffee',
    note: null,
    occurredAt: NOW,
    localDate: '2026-09-23',
    createdLocalDate: '2026-09-23',
    source: 'manual',
    receiptPath: null,
    pendingId: null,
    groupId: null,
    paidBy: 'user-1',
    splitMode: 'even',
    allocations: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function applyToRollups(rollups: Rollups, before: Expense | null, after: Expense | null): Rollups {
  return applyRollupDelta(rollups, rollupDelta(before, after));
}

describe('rollups', () => {
  it('creates daily and monthly contributions', () => {
    assert.deepEqual(buildRollups([expense()]), {
      daily: { '2026-09-23': { totalMinor: 1200, count: 1, byCategory: { food: 1200 }, refundCount: 0, refundMinor: 0, refundByCategory: {}, incomeCount: 0, incomeMinor: 0, incomeByCategory: {} } },
      monthly: {
        '2026-09': {
          totalMinor: 1200,
          count: 1,
          byCategory: { food: 1200 },
          byDay: { '2026-09-23': 1200 },
          refundCount: 0,
          refundMinor: 0,
          refundByCategory: {},
          incomeCount: 0,
          incomeMinor: 0,
          incomeByCategory: {},
        },
      },
    });
  });

  it('moves an edited amount within its buckets', () => {
    const before = expense();
    const after = expense({ total: money(2000, INR) });
    assert.deepEqual(applyToRollups(buildRollups([before]), before, after), buildRollups([after]));
  });

  it('moves an edited category within its buckets', () => {
    const before = expense();
    const after = expense({ categoryId: 'transport' });
    assert.deepEqual(applyToRollups(buildRollups([before]), before, after), buildRollups([after]));
  });

  it('moves an edited date across month boundaries', () => {
    const before = expense({ localDate: '2026-09-30' });
    const after = expense({ localDate: '2026-10-01' });
    assert.deepEqual(applyToRollups(buildRollups([before]), before, after), buildRollups([after]));
  });

  it('removes a soft-deleted expense', () => {
    const before = expense();
    const after = expense({ deletedAt: NOW });
    assert.deepEqual(applyToRollups(buildRollups([before]), before, after), buildRollups([after]));
  });

  it('makes hard deletion of a soft-deleted expense a no-op', () => {
    const deleted = expense({ deletedAt: NOW });
    assert.deepEqual(rollupDelta(deleted, null), { daily: {}, monthly: {} });
  });

  it('removes category and day keys when a delta zeroes them', () => {
    assert.deepEqual(
      applyDelta(
      { totalMinor: 1200, count: 1, byCategory: { food: 1200 }, byDay: { '2026-09-23': 1200 }, refundCount: 0, refundMinor: 0, refundByCategory: {}, incomeCount: 0, incomeMinor: 0, incomeByCategory: {} },
      { totalMinor: -1200, count: -1, byCategory: { food: -1200 }, byDay: { '2026-09-23': -1200 }, refundCount: 0, refundMinor: 0, refundByCategory: {}, incomeCount: 0, incomeMinor: 0, incomeByCategory: {} },
    ),
    { totalMinor: 0, count: 0, byCategory: {}, byDay: {}, refundCount: 0, refundMinor: 0, refundByCategory: {}, incomeCount: 0, incomeMinor: 0, incomeByCategory: {} },
  );
});

  it('matches a seeded create, edit, and soft-delete history', () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    const pick = <T>(items: readonly T[]): T => items[next() % items.length]!;
    const dates = Array.from({ length: 91 }, (_, index) => {
      if (index < 30) return `2026-09-${String(index + 1).padStart(2, '0')}`;
      if (index < 61) return `2026-10-${String(index - 29).padStart(2, '0')}`;
      return `2026-11-${String(index - 60).padStart(2, '0')}`;
    });
    for (const date of dates) {
      assert.equal(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date);
    }
    const categories = ['food', 'transport', 'fun', 'rent'] as const;
    const expenses = new Map<string, Expense>();
    let folded: Rollups = { daily: {}, monthly: {} };

    for (let index = 0; index < 500; index += 1) {
      const created = expense({
        id: `expense-${index}`,
        localDate: pick(dates),
        categoryId: pick(categories),
        total: money((next() % 100000) + 1, INR),
      });
      expenses.set(created.id, created);
      folded = applyToRollups(folded, null, created);
    }

    for (let index = 0; index < 700; index += 1) {
      const current = pick([...expenses.values()]);
      if (current.deletedAt !== null || next() % 4 === 0) {
        const after = current.deletedAt === null ? { ...current, deletedAt: NOW } : current;
        expenses.set(current.id, after);
        folded = applyToRollups(folded, current, after);
      } else {
        const after = {
          ...current,
          localDate: pick(dates),
          categoryId: pick(categories),
          total: money((next() % 100000) + 1, INR),
        };
        expenses.set(current.id, after);
        folded = applyToRollups(folded, current, after);
      }
    }

    const finalExpenses = [...expenses.values()];
    const rebuilt = buildRollups(finalExpenses);
    assert.deepEqual(folded, rebuilt);

    const monthEnd = (month: string): string => {
      const y = Number(month.slice(0, 4));
      const m = Number(month.slice(5, 7));
      return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    };
    for (const [month, rollup] of Object.entries(rebuilt.monthly)) {
      const period = { startDate: `${month}-01`, endDate: monthEnd(month) } as import('../insights').Period;
      assert.equal(periodTotal(finalExpenses, period, INR).minor, rollup.totalMinor);
      assert.ok(Number.isInteger(rollup.totalMinor));
    }
    for (const rollup of Object.values(rebuilt.daily)) assert.ok(Number.isInteger(rollup.totalMinor));
  });
});
  it('income-only day survives', () => {
    const income = expense({ categoryId: 'salary', kind: 'income' as const, total: money(10000, INR) });
    const rollups = buildRollups([income]);
    const day = rollups.daily['2026-09-23'];
    assert.ok(day);
    assert.equal(day.incomeCount, 1);
    assert.equal(day.incomeMinor, 10000);
    assert.equal(day.count, 0);
    assert.equal(day.totalMinor, 0);
  });

  it('an edit that moves a category or an account is exact', () => {
    const before = expense();
    const after = expense({ categoryId: 'transport', total: money(1500, INR) });
    const applied = applyToRollups(buildRollups([before]), before, after);
    const rebuilt = buildRollups([after]);
    assert.deepEqual(applied, rebuilt);
  });

  it('a sequence of operations equals buildRollups of what is left', () => {
    const items: Expense[] = [
      expense({ id: 'e1' }),
      expense({ id: 'e2', categoryId: 'transport', total: money(500, INR) }),
    ];
    let state: Rollups = buildRollups(items);
    // edit e1
    const e1b = items[0]!;
    const e1a = { ...e1b, total: money(2000, INR), categoryId: 'fun' };
    state = applyToRollups(state, e1b, e1a);
    // soft delete e2
    const e2b = items[1]!;
    const e2a = { ...e2b, deletedAt: NOW };
    state = applyToRollups(state, e2b, e2a);
    const left: Expense[] = [e1a];
    assert.deepEqual(state, buildRollups(left));
  });

  it('a split doc contributes per line', () => {
    const split = expense({
      id: 'split-1',
      lines: [
        { categoryId: 'food', amountMinor: 800 },
        { categoryId: 'drink', amountMinor: 400 },
      ],
      total: money(1200, INR),
    });
    const rollups = buildRollups([split]);
    const day = rollups.daily['2026-09-23'];
    assert.ok(day);
    assert.equal(day.count, 1);
    assert.equal(day.totalMinor, 1200);
    assert.deepEqual(day.byCategory, { food: 800, drink: 400 });
  });


describe('excluded squad mirrors', () => {
  it('add nothing to the buckets, and flipping the flag moves them in and out exactly', () => {
    const mirror = expense({ id: 'mirror-1', source: 'group', excludeFromSpend: true, total: money(3000, INR) });
    assert.deepEqual(buildRollups([mirror]), { daily: {}, monthly: {} });
    const counted = { ...mirror, excludeFromSpend: false };
    assert.deepEqual(applyToRollups(buildRollups([mirror]), mirror, counted), buildRollups([counted]));
    assert.deepEqual(applyToRollups(buildRollups([counted]), counted, mirror), buildRollups([mirror]));
  });
});
