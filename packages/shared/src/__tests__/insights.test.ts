/**
 * Insight invariants: the parts always sum to the whole, printed percentages
 * always sum to 100, and a day with no spending is a result rather than a gap.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type SpendRecord,
  collapseLongTail,
  compareToPrevious,
  customPeriod,
  daysInPeriod,
  displayPercentages,
  intensityStep,
  periodOf,
  periodStats,
  periodTotal,
  previousPeriod,
  stepPeriod,
  totalsByCategory,
  totalsByDay,
  weekdayAverages,
} from '../insights';
import { money } from '../money';

const INR = 'INR' as const;

const spend = (localDate: string, categoryId: string, minor: number): SpendRecord => ({
  localDate,
  categoryId,
  total: money(minor, INR),
  deletedAt: null,
});

const WEEK = { startDate: '2026-09-01', endDate: '2026-09-08' };

const RECORDS: SpendRecord[] = [
  spend('2026-09-01', 'food', 25000),
  spend('2026-09-01', 'transport', 12000),
  spend('2026-09-03', 'food', 40000),
  spend('2026-09-03', 'fun', 3000),
  spend('2026-09-07', 'rent', 4800000),
];

describe('periods', () => {
  it('includes today at both ends of the range', () => {
    const week = periodOf('week', '2026-09-05');
    assert.deepEqual(week, { startDate: '2026-08-30', endDate: '2026-09-06' });
    assert.equal(daysInPeriod(week).length, 7);
    assert.equal(daysInPeriod(week).at(-1), '2026-09-05');
  });

  it('starts a month period on the first', () => {
    assert.equal(periodOf('month', '2026-09-05').startDate, '2026-09-01');
  });

  it('crosses a month boundary without losing a day', () => {
    const week = periodOf('week', '2026-03-02');
    assert.equal(week.startDate, '2026-02-24');
    assert.equal(daysInPeriod(week).length, 7);
  });

  it('steps back to the immediately preceding window of the same length', () => {
    assert.deepEqual(previousPeriod(WEEK), { startDate: '2026-08-25', endDate: '2026-09-01' });
  });

  it('moves rolling windows in whole windows and never enters the future', () => {
    const current = periodOf('week', '2026-09-05');
    assert.deepEqual(stepPeriod(current, 'week', 1, '2026-09-05'), current);
    assert.deepEqual(stepPeriod(current, 'week', -1, '2026-09-05'), {
      startDate: '2026-08-23', endDate: '2026-08-30',
    });
  });

  it('steps a past month as a calendar month and returns to month-to-date', () => {
    const current = periodOf('month', '2026-09-19');
    const august = stepPeriod(current, 'month', -1, '2026-09-19');
    assert.deepEqual(august, { startDate: '2026-08-01', endDate: '2026-09-01' });
    assert.deepEqual(stepPeriod(august, 'month', 1, '2026-09-19'), current);
  });

  it('moves forward through older full calendar months before returning to today', () => {
    const july = { startDate: '2026-07-01', endDate: '2026-08-01' };
    assert.deepEqual(stepPeriod(july, 'month', 1, '2026-09-19'), {
      startDate: '2026-08-01', endDate: '2026-09-01',
    });
  });

  it('accepts a bounded custom window and rejects future or oversized windows', () => {
    assert.deepEqual(customPeriod('2026-08-01', '2026-08-31', '2026-09-05'), {
      startDate: '2026-08-01', endDate: '2026-08-31',
    });
    assert.throws(() => customPeriod('2025-01-01', '2026-09-01', '2026-09-05'), /366/);
    assert.throws(() => customPeriod('2026-09-01', '2026-09-07', '2026-09-05'), /future/);
  });
});

describe('category totals', () => {
  it('sums to the period total exactly, in minor units', () => {
    const totals = totalsByCategory(RECORDS, WEEK, INR);
    const summed = totals.reduce((s, t) => s + t.total.minor, 0);
    assert.equal(summed, periodTotal(RECORDS, WEEK, INR).minor);
  });

  it('ranks by amount, largest first', () => {
    const totals = totalsByCategory(RECORDS, WEEK, INR);
    assert.deepEqual(totals.map((t) => t.categoryId), ['rent', 'food', 'transport', 'fun']);
    assert.equal(totals[1]!.count, 2);
  });

  it('excludes soft-deleted records from every number', () => {
    const withDeleted = [...RECORDS, { ...spend('2026-09-02', 'food', 999999), deletedAt: 'x' }];
    assert.equal(
      periodTotal(withDeleted, WEEK, INR).minor,
      periodTotal(RECORDS, WEEK, INR).minor,
    );
  });

  it('ignores records outside the half-open window', () => {
    const outside = [...RECORDS, spend('2026-09-08', 'food', 100000)];
    assert.equal(periodTotal(outside, WEEK, INR).minor, periodTotal(RECORDS, WEEK, INR).minor);
  });
});

describe('displayed percentages', () => {
  it('always sums to exactly 100', () => {
    const totals = totalsByCategory(RECORDS, WEEK, INR);
    assert.equal(displayPercentages(totals).reduce((a, b) => a + b, 0), 100);
  });

  it('sums to 100 for thirds, where naive rounding gives 99', () => {
    const thirds = totalsByCategory(
      [spend('2026-09-01', 'a', 100), spend('2026-09-01', 'b', 100), spend('2026-09-01', 'c', 100)],
      WEEK,
      INR,
    );
    const shown = displayPercentages(thirds);
    assert.equal(shown.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(shown, [34, 33, 33]);
  });

  it('sums to 100 across many small categories', () => {
    const many = totalsByCategory(
      Array.from({ length: 7 }, (_, i) => spend('2026-09-01', `c${i}`, 1000 + i)),
      WEEK,
      INR,
    );
    assert.equal(displayPercentages(many).reduce((a, b) => a + b, 0), 100);
  });

  it('shows nothing rather than dividing by zero', () => {
    assert.deepEqual(displayPercentages([]), []);
  });
});

describe('day totals', () => {
  it('returns a contiguous run of days with no gaps', () => {
    const days = totalsByDay(RECORDS, WEEK, INR);
    assert.equal(days.length, 7);
    assert.deepEqual(days.map((d) => d.date), daysInPeriod(WEEK));
  });

  it('reports zero-spend days as zero, not as missing', () => {
    const days = totalsByDay(RECORDS, WEEK, INR);
    const quiet = days.find((d) => d.date === '2026-09-02')!;
    assert.equal(quiet.total.minor, 0);
    assert.equal(quiet.count, 0);
  });

  it('sums to the same period total the category breakdown does', () => {
    const byDay = totalsByDay(RECORDS, WEEK, INR).reduce((s, d) => s + d.total.minor, 0);
    const byCategory = totalsByCategory(RECORDS, WEEK, INR).reduce((s, c) => s + c.total.minor, 0);
    assert.equal(byDay, byCategory);
  });
});

describe('calendar intensity', () => {
  it('uses five discrete steps and preserves zero-spend days', () => {
    assert.equal(intensityStep(0, 100), 0);
    assert.equal(intensityStep(1, 100), 1);
    assert.equal(intensityStep(20, 100), 1);
    assert.equal(intensityStep(21, 100), 2);
    assert.equal(intensityStep(100, 100), 5);
  });
});

describe('period stats', () => {
  it('counts the quiet days and finds the busiest', () => {
    const stats = periodStats(RECORDS, WEEK, INR);
    assert.equal(stats.zeroSpendDays, 4);
    assert.equal(stats.busiestDay?.date, '2026-09-07');
    assert.equal(stats.count, 5);
  });

  it('has no busiest day when nothing was logged', () => {
    const stats = periodStats([], WEEK, INR);
    assert.equal(stats.busiestDay, null);
    assert.equal(stats.zeroSpendDays, 7);
    assert.equal(stats.dailyAverage.minor, 0);
  });

  it('averages weekdays over the days that actually occurred', () => {
    const averages = weekdayAverages(RECORDS, WEEK, INR);
    assert.equal(averages.length, 7);
    assert.equal(averages.reduce((s, m) => s + m.minor, 0) > 0, true);
  });
});

describe('deltas', () => {
  it('calls spending less a decrease — the good direction', () => {
    const delta = compareToPrevious(money(8000, INR), money(10000, INR));
    assert.equal(delta.direction, 'down');
    assert.equal(delta.absolute.minor, 2000);
    assert.equal(delta.percent, -20);
  });

  it('refuses to compute a percentage of nothing', () => {
    const delta = compareToPrevious(money(5000, INR), money(0, INR));
    assert.equal(delta.direction, 'up');
    assert.equal(delta.percent, null);
  });

  it('reports flat when nothing changed', () => {
    assert.equal(compareToPrevious(money(100, INR), money(100, INR)).direction, 'flat');
  });
});

describe('the long tail', () => {
  it('groups the slivers once there is more than one', () => {
    const totals = totalsByCategory(
      [
        spend('2026-09-01', 'big', 1000000),
        spend('2026-09-01', 'tiny1', 1000),
        spend('2026-09-01', 'tiny2', 1000),
      ],
      WEEK,
      INR,
    );
    const { visible, collapsed } = collapseLongTail(totals);
    assert.deepEqual(visible.map((v) => v.categoryId), ['big']);
    assert.equal(collapsed.length, 2);
  });

  it('leaves a single small category alone — one item is not a group', () => {
    const totals = totalsByCategory(
      [spend('2026-09-01', 'big', 1000000), spend('2026-09-01', 'tiny', 1000)],
      WEEK,
      INR,
    );
    assert.equal(collapseLongTail(totals).collapsed.length, 0);
  });
});
