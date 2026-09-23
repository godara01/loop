import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { periodTotal } from '../insights';
import { money } from '../money';
import { applyDelta, buildRollups, rollupDelta, type Rollups } from '../rollups';
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
  const delta = rollupDelta(before, after);
  const daily = { ...rollups.daily };
  const monthly = { ...rollups.monthly };

  for (const [date, change] of Object.entries(delta.daily)) {
    const next = applyDelta(daily[date] ?? { totalMinor: 0, count: 0, byCategory: {} }, change);
    if (next.count === 0) delete daily[date];
    else daily[date] = next;
  }
  for (const [month, change] of Object.entries(delta.monthly)) {
    const next = applyDelta(
      monthly[month] ?? { totalMinor: 0, count: 0, byCategory: {}, byDay: {} },
      change as import('../types').MonthlyRollup,
    );
    if (next.count === 0) delete monthly[month];
    else monthly[month] = next;
  }
  return { daily, monthly };
}

describe('rollups', () => {
  it('creates daily and monthly contributions', () => {
    assert.deepEqual(buildRollups([expense()]), {
      daily: { '2026-09-23': { totalMinor: 1200, count: 1, byCategory: { food: 1200 } } },
      monthly: {
        '2026-09': {
          totalMinor: 1200,
          count: 1,
          byCategory: { food: 1200 },
          byDay: { '2026-09-23': 1200 },
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
        { totalMinor: 1200, count: 1, byCategory: { food: 1200 }, byDay: { '2026-09-23': 1200 } },
        { totalMinor: -1200, count: -1, byCategory: { food: -1200 }, byDay: { '2026-09-23': -1200 } },
      ),
      { totalMinor: 0, count: 0, byCategory: {}, byDay: {} },
    );
  });

  it('matches a seeded create, edit, and soft-delete history', () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    const pick = <T>(items: readonly T[]): T => items[next() % items.length]!;
    const dates = Array.from({ length: 90 }, (_, index) => {
      const month = index < 45 ? '09' : '10';
      const day = String((index % 45) + 1).padStart(2, '0');
      return `2026-${month}-${day}`;
    });
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

    for (const [month, rollup] of Object.entries(rebuilt.monthly)) {
      assert.equal(periodTotal(finalExpenses, { startDate: `${month}-01`, endDate: month === '2026-09' ? '2026-10-01' : '2026-11-01' }, INR).minor, rollup.totalMinor);
      assert.ok(Number.isInteger(rollup.totalMinor));
    }
    for (const rollup of Object.values(rebuilt.daily)) assert.ok(Number.isInteger(rollup.totalMinor));
  });
});
