/**
 * The invariants that must never break: no paisa is ever created or destroyed,
 * and a settled squad always nets to zero.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatMoney, money, parseAmount } from '../money';
import { allocate, splitEvenly } from '../split';
import { settleUp } from '../settle';
import { EMPTY_STREAK, recordActivity, isStreakBroken } from '../streak';

const INR = 'INR' as const;
const sumOf = (xs: readonly { amount: { minor: number } }[]) =>
  xs.reduce((s, x) => s + x.amount.minor, 0);

describe('money', () => {
  it('parses decimal input into minor units', () => {
    assert.deepEqual(parseAmount('12.50', INR), money(1250, INR));
    assert.deepEqual(parseAmount('12.5', INR), money(1250, INR));
    assert.deepEqual(parseAmount('12', INR), money(1200, INR));
    assert.deepEqual(parseAmount('1,240.05', INR), money(124005, INR));
  });

  it('rejects malformed input rather than guessing', () => {
    assert.equal(parseAmount('abc', INR), null);
    assert.equal(parseAmount('1.2.3', INR), null);
    assert.equal(parseAmount('', INR), null);
  });

  it('truncates beyond the currency precision instead of rounding up', () => {
    assert.deepEqual(parseAmount('12.999', INR), money(1299, INR));
  });

  it('formats with a symbol', () => {
    assert.equal(formatMoney(money(124005, INR)), '₹1,240.05');
    assert.equal(formatMoney(money(-1250, INR)), '-₹12.50');
  });
});

describe('split', () => {
  it('never loses a minor unit on an indivisible even split', () => {
    for (const total of [100000, 100001, 99999, 7, 1, 333]) {
      for (const n of [2, 3, 6, 7, 11]) {
        const bill = money(total, INR);
        const members = Array.from({ length: n }, (_, i) => `m${i}`);
        assert.equal(sumOf(splitEvenly(bill, members)), total, `${total} / ${n}`);
      }
    }
  });

  it('spreads the remainder one unit at a time, never more', () => {
    const parts = splitEvenly(money(100000, INR), ['a', 'b', 'c']);
    const minors = parts.map((p) => p.amount.minor).sort((x, y) => x - y);
    assert.deepEqual(minors, [33333, 33333, 33334]);
  });

  it('weights shares and still sums exactly', () => {
    const result = allocate(money(100000, INR), 'shares', [
      { memberId: 'a', shares: 2 },
      { memberId: 'b', shares: 1 },
      { memberId: 'c', shares: 1 },
    ]);
    assert.equal(sumOf(result), 100000);
    assert.equal(result[0]?.amount.minor, 50000);
  });

  it('rejects exact amounts that do not add up to the bill', () => {
    assert.throws(() =>
      allocate(money(100000, INR), 'exact', [
        { memberId: 'a', exactMinor: 50000 },
        { memberId: 'b', exactMinor: 40000 },
      ]),
    );
  });

  it('rejects percentages that do not total 100', () => {
    assert.throws(() =>
      allocate(money(100000, INR), 'percentage', [
        { memberId: 'a', percentage: 60 },
        { memberId: 'b', percentage: 30 },
      ]),
    );
  });

  it('handles a refund (negative total) without drift', () => {
    const parts = splitEvenly(money(-100000, INR), ['a', 'b', 'c']);
    assert.equal(sumOf(parts), -100000);
  });
});

describe('settlement', () => {
  const expenses = [
    {
      id: 'e1',
      paidBy: 'a',
      total: money(120000, INR),
      allocations: splitEvenly(money(120000, INR), ['a', 'b', 'c']),
    },
    {
      id: 'e2',
      paidBy: 'b',
      total: money(60000, INR),
      allocations: splitEvenly(money(60000, INR), ['a', 'b', 'c']),
    },
  ];

  it('nets every balance to zero', () => {
    const { balances } = settleUp(expenses, INR);
    assert.equal(balances.reduce((s, b) => s + b.net.minor, 0), 0);
  });

  it('never needs more than n-1 transfers', () => {
    const { balances, transfers } = settleUp(expenses, INR);
    assert.ok(transfers.length <= balances.length - 1);
  });

  it('produces transfers that exactly clear every balance', () => {
    const { balances, transfers } = settleUp(expenses, INR);
    const after = new Map(balances.map((b) => [b.memberId, b.net.minor]));
    for (const t of transfers) {
      after.set(t.from, (after.get(t.from) ?? 0) + t.amount.minor);
      after.set(t.to, (after.get(t.to) ?? 0) - t.amount.minor);
    }
    for (const [member, net] of after) {
      assert.equal(net, 0, `${member} left with ${net}`);
    }
  });

  it('returns nothing to settle when the squad is square', () => {
    const { transfers } = settleUp(
      [
        {
          id: 'e1',
          paidBy: 'a',
          total: money(30000, INR),
          allocations: splitEvenly(money(30000, INR), ['a']),
        },
      ],
      INR,
    );
    assert.equal(transfers.length, 0);
  });
});

describe('streaks', () => {
  it('extends on consecutive days and resets after a gap', () => {
    let s = recordActivity(EMPTY_STREAK, '2026-09-01');
    assert.equal(s.current, 1);
    s = recordActivity(s, '2026-09-02');
    assert.equal(s.current, 2);
    s = recordActivity(s, '2026-09-05');
    assert.equal(s.current, 1);
    assert.equal(s.longest, 2);
  });

  it('is idempotent within the same day', () => {
    const first = recordActivity(EMPTY_STREAK, '2026-09-01');
    assert.deepEqual(recordActivity(first, '2026-09-01'), first);
  });

  it('reports a break only after more than one day has passed', () => {
    const s = recordActivity(EMPTY_STREAK, '2026-09-01');
    assert.equal(isStreakBroken(s, '2026-09-02'), false);
    assert.equal(isStreakBroken(s, '2026-09-03'), true);
  });
});
