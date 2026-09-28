import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_GAP_MS, scheduleHaptic } from './haptic-schedule';

describe('scheduleHaptic', () => {
  it('fires at once when the motor is free', () => {
    assert.deepEqual(scheduleHaptic(0, 'tap', 1_000), { delay: 0, nextFreeAt: 1_000 + MIN_GAP_MS });
  });

  it('defers a discrete event that arrives inside the gap', () => {
    // press at t=1000, then streakAdvance in the same tick: the check-in plate.
    const press = scheduleHaptic(0, 'press', 1_000)!;
    const streak = scheduleHaptic(press.nextFreeAt, 'streakAdvance', 1_000)!;
    assert.equal(streak.delay, MIN_GAP_MS);
  });

  it('counts a multi-beat pattern as busy until it ends', () => {
    const streak = scheduleHaptic(0, 'streakAdvance', 0)!;
    assert.equal(streak.nextFreeAt, 140 + MIN_GAP_MS);
    assert.equal(scheduleHaptic(streak.nextFreeAt, 'expenseSaved', 200)!.delay, 90);
  });

  it('drops continuous ticks that arrive too soon instead of queueing them', () => {
    const first = scheduleHaptic(0, 'dragTick', 0)!;
    assert.equal(scheduleHaptic(first.nextFreeAt, 'dragTick', 50), null);
    assert.equal(scheduleHaptic(first.nextFreeAt, 'selection', 100), null);
    assert.equal(scheduleHaptic(first.nextFreeAt, 'dragTick', MIN_GAP_MS)!.delay, 0);
  });

  it('never lets any two starts be closer than the gap', () => {
    const events = ['tap', 'press', 'streakAdvance', 'expenseSaved', 'destructive', 'warning', 'toggleOn'] as const;
    let free = 0;
    const starts: number[] = [];
    events.forEach((event, i) => {
      const slot = scheduleHaptic(free, event, i * 10)!;
      starts.push(i * 10 + slot.delay);
      free = slot.nextFreeAt;
    });
    for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i]! - starts[i - 1]! >= MIN_GAP_MS);
  });
});
