import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PRESET_IDS,
  last30,
  lastMonth,
  matchingPreset,
  presetRange,
  thisMonth,
  thisYear,
} from './date-presets';

describe('thisMonth', () => {
  it('runs from the first of the month to today', () => {
    assert.deepEqual(thisMonth('2026-09-16'), { start: '2026-09-01', end: '2026-09-16' });
  });

  it('is a single day on the first', () => {
    assert.deepEqual(thisMonth('2026-09-01'), { start: '2026-09-01', end: '2026-09-01' });
  });
});

describe('lastMonth', () => {
  it('covers the whole previous calendar month', () => {
    assert.deepEqual(lastMonth('2026-09-16'), { start: '2026-08-01', end: '2026-08-31' });
  });

  it('rolls January back to the previous December', () => {
    assert.deepEqual(lastMonth('2026-01-05'), { start: '2025-12-01', end: '2025-12-31' });
  });

  it('ends on the 30th for a 30-day month', () => {
    assert.deepEqual(lastMonth('2026-05-20'), { start: '2026-04-01', end: '2026-04-30' });
  });

  it('ends on the 28th for a common February', () => {
    assert.deepEqual(lastMonth('2026-03-10'), { start: '2026-02-01', end: '2026-02-28' });
  });

  it('ends on the 29th for a leap February', () => {
    assert.deepEqual(lastMonth('2024-03-01'), { start: '2024-02-01', end: '2024-02-29' });
  });

  it('is unaffected by the day of the month it is asked on', () => {
    assert.deepEqual(lastMonth('2024-03-31'), lastMonth('2024-03-01'));
  });
});

describe('last30', () => {
  it('spans 30 days including today', () => {
    assert.deepEqual(last30('2026-09-16'), { start: '2026-08-18', end: '2026-09-16' });
  });

  it('crosses a leap day without losing one', () => {
    assert.deepEqual(last30('2024-03-10'), { start: '2024-02-10', end: '2024-03-10' });
  });
});

describe('thisYear', () => {
  it('runs from January 1st to today', () => {
    assert.deepEqual(thisYear('2026-09-16'), { start: '2026-01-01', end: '2026-09-16' });
  });

  it('is a single day on New Year', () => {
    assert.deepEqual(thisYear('2026-01-01'), { start: '2026-01-01', end: '2026-01-01' });
  });
});

describe('presetRange', () => {
  it('dispatches to each preset', () => {
    const today = '2026-09-16';
    assert.deepEqual(presetRange('this-month', today), thisMonth(today));
    assert.deepEqual(presetRange('last-month', today), lastMonth(today));
    assert.deepEqual(presetRange('last-30', today), last30(today));
    assert.deepEqual(presetRange('this-year', today), thisYear(today));
  });

  it('never returns an end before its start', () => {
    for (const today of ['2024-02-29', '2026-01-01', '2026-12-31', '2026-03-01']) {
      for (const id of PRESET_IDS) {
        const range = presetRange(id, today);
        assert.ok(range.start <= range.end, `${id} on ${today}: ${range.start} > ${range.end}`);
      }
    }
  });
});

describe('matchingPreset', () => {
  it('has nothing selected without a date facet', () => {
    assert.equal(matchingPreset(null, '2026-09-16'), null);
  });

  it('lights up the preset that produced the range', () => {
    const today = '2026-09-16';
    for (const id of PRESET_IDS) {
      assert.equal(matchingPreset(presetRange(id, today), today), id);
    }
  });

  it('falls back to custom for a hand-picked range', () => {
    assert.equal(matchingPreset({ start: '2026-09-03', end: '2026-09-09' }, '2026-09-16'), 'custom');
  });

  it('treats a range that was a preset yesterday as custom today', () => {
    // "This month" captured on the 15th no longer ends today.
    assert.equal(matchingPreset({ start: '2026-09-01', end: '2026-09-15' }, '2026-09-16'), 'custom');
  });
});
