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
  clampRefunds,
  deltaTone,
  intensityStep,
  mergePeriodSources,
  mergePeriodSourcesForView,
  periodIncome,
  periodNet,
  periodSpend,
  totalsByCategoryForKind,
  totalsByDayForView,
  periodOf,
  periodStats,
  periodTotal,
  previousPeriod,
  savedCustomPeriod,
  stepPeriod,
  totalsByCategory,
  totalsByDay,
  weekdayAverages,
} from '../insights';
import { money } from '../money';
import { buildRollups } from '../rollups';
import type { Expense } from '../types';

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

  it('returns saved custom period when both dates are set and valid', () => {
    const settings = { insightsCustomStartDate: '2026-08-01', insightsCustomEndDate: '2026-08-31' };
    assert.deepEqual(savedCustomPeriod(settings, '2026-09-05'), {
      startDate: '2026-08-01', endDate: '2026-08-31',
    });
  });

  it('falls back to default when one date is missing', () => {
    const withoutStart = { insightsCustomStartDate: null, insightsCustomEndDate: '2026-08-31' };
    const withoutEnd = { insightsCustomStartDate: '2026-08-01', insightsCustomEndDate: null };
    assert.deepEqual(savedCustomPeriod(withoutStart, '2026-09-05'), periodOf('custom', '2026-09-05'));
    assert.deepEqual(savedCustomPeriod(withoutEnd, '2026-09-05'), periodOf('custom', '2026-09-05'));
  });

  it('falls back to default when range is invalid (>366 days)', () => {
    const settings = { insightsCustomStartDate: '2025-01-01', insightsCustomEndDate: '2026-09-01' };
    assert.deepEqual(savedCustomPeriod(settings, '2026-09-05'), periodOf('custom', '2026-09-05'));
  });

  it('falls back to default when range includes future dates', () => {
    const settings = { insightsCustomStartDate: '2026-09-01', insightsCustomEndDate: '2026-09-07' };
    assert.deepEqual(savedCustomPeriod(settings, '2026-09-05'), periodOf('custom', '2026-09-05'));
  });

  it('steps custom period backward by its own length', () => {
    const current = { startDate: '2026-08-15', endDate: '2026-09-05' };
    const stepped = stepPeriod(current, 'custom', -1, '2026-09-05');
    assert.deepEqual(stepped, { startDate: '2026-07-25', endDate: '2026-08-15' });
  });

  it('steps custom period forward when next window does not pass today', () => {
    const current = { startDate: '2026-08-01', endDate: '2026-08-22' };
    const stepped = stepPeriod(current, 'custom', 1, '2026-09-30');
    assert.deepEqual(stepped, { startDate: '2026-08-22', endDate: '2026-09-12' });
  });

  it('returns custom period unchanged when forward step would pass today', () => {
    const current = { startDate: '2026-08-20', endDate: '2026-09-05' };
    const stepped = stepPeriod(current, 'custom', 1, '2026-09-05');
    assert.deepEqual(stepped, current);
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

describe('rollups + cache merge', () => {
  // Aug 20 – Sep 15: 17 rollup days in August (and Sep 1 onward from the cache).
  const PERIOD = { startDate: '2026-08-20', endDate: '2026-09-16' };
  const CACHE_FROM = '2026-09-01';
  const cats = ['food', 'transport', 'fun', 'rent', 'groceries'];

  // Deterministic spread: some days empty, some with several expenses, awkward amounts.
  const records: SpendRecord[] = [];
  daysInPeriod(PERIOD).forEach((date, i) => {
    for (let n = 0; n < i % 4; n += 1) {
      records.push(spend(date, cats[(i + n) % cats.length]!, 1_001 * (i + 1) + 37 * n));
    }
  });
  records.push({ ...spend('2026-08-25', 'food', 99_999), deletedAt: '2026-08-26T00:00:00.000Z' });
  records.push({ ...spend('2026-09-05', 'fun', 55_555), deletedAt: '2026-09-06T00:00:00.000Z' });
  // Spend on both sides of the boundary, so an off-by-one there changes the totals.
  records.push(spend('2026-08-31', 'food', 31_031), spend('2026-09-01', 'rent', 90_101));
  // Outside the period on both sides: must be ignored by both paths.
  records.push(spend('2026-08-19', 'food', 7_777), spend('2026-09-16', 'food', 8_888));

  const rollups = buildRollups(records as unknown as Expense[]).daily;
  const merged = mergePeriodSources({ period: PERIOD, currency: INR, cacheFrom: CACHE_FROM, rollups, cached: records });

  it('has no gaps in totalsByDay across the rollup/cache boundary', () => {
    assert.deepEqual(merged.days.map((d) => d.date), daysInPeriod(PERIOD));
    assert.ok(merged.days.some((d) => d.date === '2026-08-31'));
    assert.ok(merged.days.some((d) => d.date === '2026-09-01'));
    assert.ok(merged.days.some((d) => d.total.minor === 0), 'zero-spend days are present as zero');
  });

  it('equals an all-cache computation of the same data exactly', () => {
    assert.deepEqual(merged.total, periodTotal(records, PERIOD, INR));
    assert.deepEqual(merged.days, totalsByDay(records, PERIOD, INR));
    assert.deepEqual(merged.stats, periodStats(records, PERIOD, INR));
    assert.deepEqual(merged.weekdays, weekdayAverages(records, PERIOD, INR));
    const fromCache = totalsByCategory(records, PERIOD, INR);
    assert.deepEqual(
      merged.totals.map(({ categoryId, total, share }) => ({ categoryId, total, share })),
      fromCache.map(({ categoryId, total, share }) => ({ categoryId, total, share })),
    );
  });

  it('keeps displayPercentages summing to 100', () => {
    const percentages = displayPercentages(merged.totals);
    assert.equal(percentages.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(percentages, displayPercentages(totalsByCategory(records, PERIOD, INR)));
  });

  it('flags category counts as inexact once rollups are used, and exact for an all-cache period', () => {
    assert.equal(merged.categoryCountsExact, false);
    const current = { startDate: '2026-09-01', endDate: '2026-09-16' };
    const cacheOnly = mergePeriodSources({ period: current, currency: INR, cacheFrom: CACHE_FROM, rollups: {}, cached: records });
    assert.equal(cacheOnly.categoryCountsExact, true);
    assert.deepEqual(cacheOnly.totals, totalsByCategory(records, current, INR));
  });

  it('reads past days only from rollups, even if stale cached expenses are present', () => {
    const stale = [...records, spend('2026-08-22', 'food', 1_000_000)];
    const result = mergePeriodSources({ period: PERIOD, currency: INR, cacheFrom: CACHE_FROM, rollups, cached: stale });
    assert.deepEqual(result.total, merged.total);
  });
});

// ── v1.2: Spend, Income, Net (docs/05 acceptance fixture) ─────────────────

describe('spend / income / net (v1.2)', () => {
  const MARCH = { startDate: '2026-03-01', endDate: '2026-04-01' };
  const FEBRUARY = { startDate: '2026-02-01', endDate: '2026-03-01' };
  const tx = (id: string, kind: SpendRecord['kind'], localDate: string, categoryId: string, minor: number, extra: Partial<SpendRecord> = {}): SpendRecord => ({
    id,
    kind,
    localDate,
    categoryId,
    total: money(minor, INR),
    deletedAt: null,
    ...extra,
  });

  // Hand-computed below. Spend = 250,000 + 100,000 + 20,000 + 40,000 − 200,000 − 40,000 = 170,000.
  const FIXTURE: SpendRecord[] = [
    tx('e1', 'expense', '2026-03-02', 'FOOD', 250000),
    tx('e2', 'expense', '2026-02-10', 'SHOPPING', 300000),
    tx('r1', 'refund', '2026-03-05', 'SHOPPING', 200000, { refundOf: 'e2' }), // refund a period later
    tx('e3', 'expense', '2026-03-08', 'TRAVEL', 100000),
    tx('r2', 'refund', '2026-03-09', 'TRAVEL', 40000, { refundOf: 'e3' }), // same period
    tx('i1', 'income', '2026-03-01', 'SALARY', 5000000),
    tx('i2', 'income', '2026-03-15', 'CASHBACK', 2500),
    tx('t1', 'transfer', '2026-03-10', 'sys-transfer', 1000000),
    tx('m1', 'expense', '2026-03-12', 'FOOD', 30000, { excludeFromSpend: true }), // excluded mirror
    tx('m2', 'expense', '2026-03-13', 'FOOD', 20000, { excludeFromSpend: false }), // included mirror
    tx('e4', 'expense', '2026-03-20', 'FOOD', 10000, { deletedAt: '2026-03-21T00:00:00.000Z' }),
    tx('e5', 'expense', '2026-03-21', 'FOOD', 40000, { lines: [{ categoryId: 'FOOD', amountMinor: 15000 }, { categoryId: 'HOME', amountMinor: 25000 }] }),
  ];

  it('computes spend, income and net by hand', () => {
    assert.deepEqual(periodSpend(FIXTURE, MARCH, INR), money(170000, INR));
    assert.deepEqual(periodIncome(FIXTURE, MARCH, INR), money(5002500, INR));
    assert.deepEqual(periodNet(FIXTURE, MARCH, INR), money(4832500, INR));
  });

  it('counts a refund in its own period, not the purchase\'s', () => {
    assert.deepEqual(periodSpend(FIXTURE, FEBRUARY, INR), money(300000, INR));
  });

  it('nets categories, keeps a net-refund category negative and last', () => {
    const rows = totalsByCategoryForKind(FIXTURE, MARCH, 'spend', INR);
    assert.deepEqual(rows.map((r) => [r.categoryId, r.total.minor]), [['FOOD', 285000], ['TRAVEL', 60000], ['HOME', 25000], ['SHOPPING', -200000]]);
    assert.equal(rows[0]!.count, 3);
    assert.equal(rows.reduce((sum, r) => sum + r.total.minor, 0), 170000);
    assert.equal(rows[3]!.share, 0);
    assert.equal(rows[0]!.share, 285000 / 370000);
  });

  it('keeps percentages summing to 100 with a net-negative category present', () => {
    const percentages = displayPercentages(totalsByCategoryForKind(FIXTURE, MARCH, 'spend', INR));
    assert.deepEqual(percentages, [77, 16, 7, 0]);
    assert.equal(percentages.reduce((a, b) => a + b, 0), 100);
  });

  it('lists income categories only in Income', () => {
    const rows = totalsByCategoryForKind(FIXTURE, MARCH, 'income', INR);
    assert.deepEqual(rows.map((r) => [r.categoryId, r.total.minor]), [['SALARY', 5000000], ['CASHBACK', 2500]]);
  });

  it('gives per-day spend, income and net that add up to the headlines', () => {
    const spendDays = totalsByDayForView(FIXTURE, MARCH, 'spend', INR);
    assert.equal(spendDays.length, 31);
    assert.equal(spendDays.find((d) => d.date === '2026-03-05')!.total.minor, -200000);
    assert.equal(spendDays.find((d) => d.date === '2026-03-10')!.total.minor, 0);
    assert.equal(spendDays.find((d) => d.date === '2026-03-10')!.count, 0);
    assert.equal(spendDays.reduce((sum, d) => sum + d.total.minor, 0), 170000);
    assert.equal(totalsByDayForView(FIXTURE, MARCH, 'income', INR).reduce((sum, d) => sum + d.total.minor, 0), 5002500);
    assert.equal(totalsByDayForView(FIXTURE, MARCH, 'net', INR).reduce((sum, d) => sum + d.total.minor, 0), 4832500);
  });

  it('treats a v1 record (no kind) as an expense', () => {
    assert.deepEqual(periodSpend([spend('2026-03-03', 'food', 1234)], MARCH, INR), money(1234, INR));
    assert.deepEqual(periodIncome([spend('2026-03-03', 'food', 1234)], MARCH, INR), money(0, INR));
  });

  it('colours deltas by view', () => {
    const up = compareToPrevious(money(200, INR), money(100, INR));
    const down = compareToPrevious(money(100, INR), money(200, INR));
    const flat = compareToPrevious(money(100, INR), money(100, INR));
    assert.deepEqual([deltaTone('spend', up), deltaTone('spend', down), deltaTone('spend', flat)], ['bad', 'good', 'neutral']);
    assert.deepEqual([deltaTone('income', up), deltaTone('income', down), deltaTone('income', flat)], ['good', 'bad', 'neutral']);
    assert.deepEqual([deltaTone('net', up), deltaTone('net', down), deltaTone('net', flat)], ['good', 'bad', 'neutral']);
  });

  describe('clampRefunds', () => {
    const original = tx('e6', 'expense', '2026-03-01', 'SHOPPING', 100000);
    const ra = tx('ra', 'refund', '2026-03-05', 'SHOPPING', 100000, { refundOf: 'e6' });
    const rb = tx('rb', 'refund', '2026-03-06', 'SHOPPING', 100000, { refundOf: 'e6' });

    it('caps a double refund at the original, later refund first to go', () => {
      const input = [rb, original, ra];
      const out = clampRefunds(input);
      assert.equal(out.length, 3);
      assert.deepEqual(out.map((r) => [r.id, r.total.minor]), [['rb', 0], ['e6', 100000], ['ra', 100000]]);
      assert.equal(out[2], ra, 'an unchanged refund is the same object');
      assert.deepEqual(periodSpend(input, MARCH, INR), money(0, INR));
    });

    it('leaves a refund alone when its original is not loaded', () => {
      const out = clampRefunds([rb]);
      assert.equal(out[0], rb);
      assert.deepEqual(periodSpend([rb], MARCH, INR), money(-100000, INR));
    });

    it('ignores refunds of a deleted original and deleted refunds', () => {
      const deletedOriginal = { ...original, deletedAt: '2026-03-07T00:00:00.000Z' };
      assert.deepEqual(clampRefunds([deletedOriginal, ra, rb]).map((r) => r.total.minor), [100000, 100000, 100000]);
      const deletedRa = { ...ra, deletedAt: '2026-03-07T00:00:00.000Z' };
      assert.deepEqual(clampRefunds([original, deletedRa, rb]).map((r) => r.total.minor), [100000, 100000, 100000]);
    });

    it('re-apportions a clamped split refund so its lines still sum exactly', () => {
      const split = tx('rs', 'refund', '2026-03-05', 'SHOPPING', 120001, {
        refundOf: 'e6',
        lines: [{ categoryId: 'SHOPPING', amountMinor: 60001 }, { categoryId: 'HOME', amountMinor: 60000 }],
      });
      const [, clamped] = clampRefunds([original, split]);
      assert.equal(clamped!.total.minor, 100000);
      assert.equal(clamped!.lines!.reduce((sum, l) => sum + l.amountMinor, 0), 100000);
    });

    it('never mutates its input', () => {
      const input = [original, ra, rb];
      const before = structuredClone(input);
      clampRefunds(input);
      assert.deepEqual(input, before);
    });
  });
});

describe('rollups + cache merge per view (v1.2)', () => {
  const MARCH = { startDate: '2026-03-01', endDate: '2026-04-01' };
  const doc = (id: string, kind: SpendRecord['kind'], localDate: string, categoryId: string, minor: number, extra: Partial<SpendRecord> = {}): SpendRecord => ({
    id, kind, localDate, categoryId, total: money(minor, INR), deletedAt: null, ...extra,
  });
  const DOCS: SpendRecord[] = [
    doc('e1', 'expense', '2026-03-02', 'FOOD', 250000),
    doc('e2', 'expense', '2026-02-10', 'SHOPPING', 300000),
    doc('r1', 'refund', '2026-03-05', 'SHOPPING', 200000, { refundOf: 'e2' }),
    doc('e3', 'expense', '2026-03-08', 'TRAVEL', 100000),
    doc('r2', 'refund', '2026-03-12', 'TRAVEL', 40000, { refundOf: 'e3' }),
    doc('i1', 'income', '2026-03-01', 'SALARY', 5000000),
    doc('i2', 'income', '2026-03-15', 'CASHBACK', 2500),
    doc('t1', 'transfer', '2026-03-10', 'sys-transfer', 1000000),
    doc('m1', 'expense', '2026-03-12', 'FOOD', 30000, { excludeFromSpend: true }),
    doc('m2', 'expense', '2026-03-13', 'FOOD', 20000),
    doc('e4', 'expense', '2026-03-20', 'FOOD', 10000, { deletedAt: '2026-03-21T00:00:00.000Z' }),
    doc('e5', 'expense', '2026-03-21', 'FOOD', 40000, { lines: [{ categoryId: 'FOOD', amountMinor: 15000 }, { categoryId: 'HOME', amountMinor: 25000 }] }),
  ];
  const rollups = buildRollups(DOCS as unknown as Expense[]).daily;
  const merge = (cacheFrom: string, view: 'spend' | 'income' | 'net') =>
    mergePeriodSourcesForView({ period: MARCH, currency: INR, cacheFrom, rollups, cached: DOCS }, view);
  const EXPECTED = { spend: 170000, income: 5002500, net: 4832500 } as const;
  const strip = (rows: readonly { categoryId: string; total: { minor: number } }[]) => rows.map((r) => [r.categoryId, r.total.minor]);

  for (const view of ['spend', 'income', 'net'] as const) {
    it(`${view}: rollups, cache and a mix of both agree exactly`, () => {
      const allCache = merge(MARCH.startDate, view);
      const mixed = merge('2026-03-10', view);
      const allRollups = merge(MARCH.endDate, view);
      for (const result of [allCache, mixed, allRollups]) {
        assert.equal(result.total.minor, EXPECTED[view]);
        assert.deepEqual(result.days.map((d) => d.total), allCache.days.map((d) => d.total));
        assert.deepEqual(strip(result.totals), strip(allCache.totals));
        assert.deepEqual(result.days.map((d) => d.count), allCache.days.map((d) => d.count));
      }
      assert.equal(allCache.categoryCountsExact, true);
      assert.equal(mixed.categoryCountsExact, false);
    });
  }

  it('matches the document-only functions for the cached path', () => {
    const allCache = merge(MARCH.startDate, 'spend');
    assert.deepEqual(strip(allCache.totals), strip(totalsByCategoryForKind(DOCS, MARCH, 'spend', INR)));
    assert.deepEqual(allCache.days, totalsByDayForView(DOCS, MARCH, 'spend', INR));
  });

  it('gives Net two rows, in and out', () => {
    assert.deepEqual(strip(merge('2026-03-10', 'net').totals), [['in', 5002500], ['out', 170000]]);
  });

  it('reads a v1 rollup (no refund or income buckets) as expense-only', () => {
    const v1 = { '2026-03-02': { totalMinor: 5000, count: 2, byCategory: { food: 5000 } } };
    const sources = { period: MARCH, currency: INR, cacheFrom: MARCH.endDate, rollups: v1, cached: [] };
    assert.equal(mergePeriodSourcesForView(sources, 'spend').total.minor, 5000);
    assert.equal(mergePeriodSourcesForView(sources, 'income').total.minor, 0);
    assert.equal(mergePeriodSourcesForView(sources, 'net').total.minor, -5000);
  });
});
