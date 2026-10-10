import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthGrid,
  isSelectable,
  applyRangeTap,
  canStepMonth,
  type RangeState,
} from './date-picker-model';

describe('monthGrid', () => {
  it('generates a leap February 2028', () => {
    const grid = monthGrid(2028, 2);
    assert.equal(grid.year, 2028);
    assert.equal(grid.month, 2);
    assert.equal(grid.weeks.length, 5);

    const allDays = grid.weeks.flat();
    const inMonth = allDays.filter((c) => !c.outOfMonth);
    assert.equal(inMonth.length, 29);
    assert.equal(inMonth[0].day, 1);
    assert.equal(inMonth[28].day, 29);
    assert.equal(inMonth[28].date, '2028-02-29');
  });

  it('generates a month starting on Sunday (2026-03)', () => {
    const grid = monthGrid(2026, 3);
    assert.equal(grid.weeks.length, 6);

    const firstWeek = grid.weeks[0];
    assert.equal(firstWeek.length, 7);
    assert.equal(firstWeek[0].outOfMonth, true);
    assert.equal(firstWeek[6].day, 1);
    assert.equal(firstWeek[6].outOfMonth, false);
    assert.equal(firstWeek[6].date, '2026-03-01');
  });

  it('starts weeks on Monday', () => {
    const grid = monthGrid(2026, 10);
    const firstWeek = grid.weeks[0];
    
    assert.equal(firstWeek[0].outOfMonth, true);
    assert.equal(firstWeek[3].day, 1);
    assert.equal(firstWeek[3].date, '2026-10-01');
  });
});

describe('isSelectable', () => {
  it('disables future days by default', () => {
    const today = '2026-10-10';
    assert.equal(isSelectable('2026-10-11', today), false);
    assert.equal(isSelectable('2026-10-10', today), true);
    assert.equal(isSelectable('2026-10-09', today), true);
  });

  it('allows future days when allowFuture is true', () => {
    const today = '2026-10-10';
    assert.equal(isSelectable('2026-10-11', today, { allowFuture: true }), true);
    assert.equal(isSelectable('2027-01-01', today, { allowFuture: true }), true);
  });

  it('respects minDate boundary', () => {
    const today = '2026-10-10';
    const minDate = '2026-01-01';
    assert.equal(isSelectable('2025-12-31', today, { minDate }), false);
    assert.equal(isSelectable('2026-01-01', today, { minDate }), true);
    assert.equal(isSelectable('2026-01-02', today, { minDate }), true);
  });

  it('defaults minDate to 2000-01-01', () => {
    const today = '2026-10-10';
    assert.equal(isSelectable('1999-12-31', today), false);
    assert.equal(isSelectable('2000-01-01', today), true);
  });
});

describe('applyRangeTap', () => {
  it('sets start on first tap', () => {
    const state: RangeState = { start: null, end: null };
    const result = applyRangeTap(state, '2026-10-05', 366);
    
    assert.equal(result.type, 'ok');
    assert.equal(result.state.start, '2026-10-05');
    assert.equal(result.state.end, null);
  });

  it('sets end on second tap', () => {
    const state: RangeState = { start: '2026-10-05', end: null };
    const result = applyRangeTap(state, '2026-10-10', 366);
    
    assert.equal(result.type, 'ok');
    assert.equal(result.state.start, '2026-10-05');
    assert.equal(result.state.end, '2026-10-10');
  });

  it('swaps reversed taps', () => {
    const state: RangeState = { start: '2026-10-10', end: null };
    const result = applyRangeTap(state, '2026-10-05', 366);
    
    assert.equal(result.type, 'ok');
    assert.equal(result.state.start, '2026-10-05');
    assert.equal(result.state.end, '2026-10-10');
  });

  it('rejects range over limit', () => {
    const state: RangeState = { start: '2026-01-01', end: null };
    const result = applyRangeTap(state, '2026-02-10', 30);
    
    assert.equal(result.type, 'tooLong');
    assert.equal(result.state.start, '2026-01-01');
    assert.equal(result.state.end, null);
  });

  it('accepts range at exact limit', () => {
    const state: RangeState = { start: '2026-01-01', end: null };
    const result = applyRangeTap(state, '2026-01-30', 30);
    
    assert.equal(result.type, 'ok');
    assert.equal(result.state.start, '2026-01-01');
    assert.equal(result.state.end, '2026-01-30');
  });

  it('resets range on third tap', () => {
    const state: RangeState = { start: '2026-10-05', end: '2026-10-10' };
    const result = applyRangeTap(state, '2026-10-15', 366);
    
    assert.equal(result.type, 'ok');
    assert.equal(result.state.start, '2026-10-15');
    assert.equal(result.state.end, null);
  });
});

describe('canStepMonth', () => {
  it('allows stepping back to minDate month', () => {
    const today = '2026-10-10';
    const minDate = '2026-01-15';
    
    assert.equal(canStepMonth(-1, { year: 2026, month: 2 }, today, false, minDate), true);
    assert.equal(canStepMonth(-1, { year: 2026, month: 1 }, today, false, minDate), false);
  });

  it('prevents stepping forward past current month when allowFuture is false', () => {
    const today = '2026-10-10';
    
    assert.equal(canStepMonth(1, { year: 2026, month: 9 }, today, false, '2000-01-01'), true);
    assert.equal(canStepMonth(1, { year: 2026, month: 10 }, today, false, '2000-01-01'), false);
  });

  it('allows stepping forward past current month when allowFuture is true', () => {
    const today = '2026-10-10';
    
    assert.equal(canStepMonth(1, { year: 2026, month: 10 }, today, true, '2000-01-01'), true);
    assert.equal(canStepMonth(1, { year: 2026, month: 12 }, today, true, '2000-01-01'), true);
  });

  it('handles year boundaries', () => {
    const today = '2026-10-10';
    const minDate = '2025-01-01';
    
    assert.equal(canStepMonth(-1, { year: 2026, month: 1 }, today, false, minDate), true);
    assert.equal(canStepMonth(1, { year: 2025, month: 12 }, today, false, minDate), true);
  });
});
