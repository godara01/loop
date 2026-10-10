import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { composeOccurredAt, timeOfDayOf } from '../dates';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const inNewYork = TZ === 'America/New_York';
const inKolkata = TZ === 'Asia/Kolkata' || TZ === 'Asia/Calcutta';

/** Deterministic PRNG (mulberry32) so a failing property case reproduces. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function localDateOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('timeOfDayOf', () => {
  test('extracts time components', () => {
    const t = timeOfDayOf('2026-03-15T14:32:45.123Z');
    assert.equal(typeof t.h, 'number');
    assert.equal(typeof t.m, 'number');
    assert.equal(typeof t.s, 'number');
  });
});

describe('composeOccurredAt', () => {
  test('today returns now', () => {
    const now = new Date('2026-03-15T14:32:45.123Z');
    const today = localDateOf(now.toISOString());
    const result = composeOccurredAt(today, { h: 10, m: 30, s: 0 }, now);
    assert.equal(result, now.toISOString());
  });

  test('past date keeps current wall-clock time', () => {
    const now = new Date('2026-03-15T14:32:45.123Z');
    const pastDate = '2026-03-10';
    const time = timeOfDayOf(now.toISOString());
    const result = composeOccurredAt(pastDate, time, now);
    const composed = new Date(result);
    
    assert.equal(composed.getFullYear(), 2026);
    assert.equal(composed.getMonth(), 2);
    assert.equal(composed.getDate(), 10);
    assert.equal(composed.getHours(), now.getHours());
    assert.equal(composed.getMinutes(), now.getMinutes());
  });

  test('never produces future instant', () => {
    const now = new Date('2026-03-15T14:32:45.123Z');
    const futureDate = '2026-03-20';
    const result = composeOccurredAt(futureDate, { h: 10, m: 30, s: 0 }, now);
    assert.equal(result, now.toISOString());
  });

  test('DST spring forward gap - 2026-03-08 02:30 New York', () => {
    const now = new Date('2026-03-10T15:00:00.000Z');
    const gapDate = '2026-03-08';
    const gapTime = { h: 2, m: 30, s: 0 };
    const result = composeOccurredAt(gapDate, gapTime, now);
    const composed = new Date(result);
    
    assert.equal(composed.getFullYear(), 2026);
    assert.equal(composed.getMonth(), 2);
    assert.equal(composed.getDate(), 8);
    assert.ok(composed.getTime() <= now.getTime());
  });

  test('DST gap moves to the first valid minute (03:00 EDT)', { skip: !inNewYork && 'needs TZ=America/New_York' }, () => {
    const result = composeOccurredAt('2026-03-08', { h: 2, m: 30, s: 0 }, new Date('2026-03-10T15:00:00.000Z'));
    assert.equal(result, '2026-03-08T07:00:00.000Z');
  });

  test('DST repeated hour takes the first occurrence (01:30 EDT)', { skip: !inNewYork && 'needs TZ=America/New_York' }, () => {
    const result = composeOccurredAt('2026-11-01', { h: 1, m: 30, s: 0 }, new Date('2026-11-05T15:00:00.000Z'));
    assert.equal(result, '2026-11-01T05:30:00.000Z');
  });

  test('DST fall back repeated hour - 2026-11-01 01:30 New York', () => {
    const now = new Date('2026-11-05T15:00:00.000Z');
    const repeatDate = '2026-11-01';
    const repeatTime = { h: 1, m: 30, s: 0 };
    const result = composeOccurredAt(repeatDate, repeatTime, now);
    const composed = new Date(result);
    
    assert.equal(composed.getFullYear(), 2026);
    assert.equal(composed.getMonth(), 10);
    assert.equal(composed.getDate(), 1);
    assert.ok(composed.getTime() <= now.getTime());
  });

  test('Asia/Kolkata no DST', () => {
    const now = new Date('2026-03-15T10:00:00.000Z');
    const pastDate = '2026-03-10';
    const time = { h: 15, m: 30, s: 0 };
    const result = composeOccurredAt(pastDate, time, now);
    const composed = new Date(result);
    
    assert.equal(composed.getFullYear(), 2026);
    assert.equal(composed.getMonth(), 2);
    assert.equal(composed.getDate(), 10);
  });

  test('Asia/Kolkata keeps the exact wall-clock time', { skip: !inKolkata && 'needs TZ=Asia/Kolkata' }, () => {
    const result = composeOccurredAt('2026-03-10', { h: 15, m: 30, s: 0 }, new Date('2026-03-15T10:00:00.000Z'));
    assert.equal(result, '2026-03-10T10:00:00.000Z');
  });

  test('property: localDateOf(composeOccurredAt(d, t, now)) === d for random past dates', () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const startMs = new Date('2023-01-01T00:00:00.000Z').getTime();
    const endMs = now.getTime();
    
    const random = seeded(20261010);
    for (let i = 0; i < 1000; i++) {
      const randomMs = startMs + random() * (endMs - startMs);
      const randomDate = new Date(randomMs);
      const localDate = localDateOf(randomDate.toISOString());
      const time = timeOfDayOf(randomDate.toISOString());
      const result = composeOccurredAt(localDate, time, now);
      assert.equal(localDateOf(result), localDate);
    }
  });
});
