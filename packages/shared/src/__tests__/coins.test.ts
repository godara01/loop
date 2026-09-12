/**
 * The coin economy's two promises: a cap can never be exceeded however many
 * times an event fires, and nothing is ever debited.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COIN_RULES,
  type CoinContext,
  type CoinLedgerEntry,
  coinBalance,
  coinEntryId,
  completesWeek,
  evaluateCoinEvent,
} from '../coins';

const DATE = '2026-09-05';
const NOW = '2026-09-05T10:00:00.000Z';

const ctx = (entriesToday: CoinLedgerEntry[] = [], onceRulesAwarded: CoinContext['onceRulesAwarded'] = []): CoinContext => ({
  localDate: DATE,
  createdAt: NOW,
  entriesToday,
  onceRulesAwarded,
});

describe('coin entry ids', () => {
  it('keys daily rules on the date, so a double tap is one row', () => {
    assert.equal(coinEntryId('check_in', { localDate: DATE }), 'check_in__2026-09-05');
  });

  it('keys object rules on the thing, so a retry is one row', () => {
    assert.equal(coinEntryId('expense_logged', { refId: 'e-1' }), 'expense_logged__e-1');
  });

  it('keys once-rules on nothing, because there is only ever one', () => {
    assert.equal(coinEntryId('first_expense', {}), 'first_expense__once');
  });

  it('refuses to build an id it cannot make stable', () => {
    assert.throws(() => coinEntryId('expense_logged', {}));
    assert.throws(() => coinEntryId('check_in', {}));
  });
});

describe('checking in', () => {
  it('awards the check-in once per day', () => {
    const first = evaluateCoinEvent({ kind: 'day_banked', zeroSpend: false }, ctx());
    assert.equal(first.length, 1);
    assert.equal(first[0]!.coins, COIN_RULES.check_in.coins);

    const second = evaluateCoinEvent({ kind: 'day_banked', zeroSpend: false }, ctx(first));
    assert.deepEqual(second, [], 'a second check-in the same day awards nothing');
  });

  it('pays the zero-spend bonus alongside it', () => {
    const entries = evaluateCoinEvent({ kind: 'day_banked', zeroSpend: true }, ctx());
    assert.deepEqual(
      entries.map((e) => e.ruleId).sort(),
      ['check_in', 'zero_spend'],
    );
    assert.equal(coinBalance(entries), 8);
  });
});

describe('logging expenses', () => {
  it('pays for the first three of the day and no more', () => {
    let today: CoinLedgerEntry[] = [];

    for (let i = 1; i <= 10; i += 1) {
      today = today.concat(
        evaluateCoinEvent(
          { kind: 'expense_logged', expenseId: `e-${i}`, categorised: true, isFirstEver: false },
          ctx(today),
        ),
      );
    }

    const logged = today.filter((e) => e.ruleId === 'expense_logged');
    const categorised = today.filter((e) => e.ruleId === 'categorised');
    assert.equal(logged.length, 3, 'expense_logged caps at 3/day');
    assert.equal(categorised.length, 3, 'categorised caps at 3/day');
    assert.equal(coinBalance(today), 9, '3×2 + 3×1');
  });

  it('pays nothing extra for an expense left in OTHER', () => {
    const entries = evaluateCoinEvent(
      { kind: 'expense_logged', expenseId: 'e-1', categorised: false, isFirstEver: false },
      ctx(),
    );
    assert.deepEqual(entries.map((e) => e.ruleId), ['expense_logged']);
  });

  it('awards the first-expense bonus exactly once in an account lifetime', () => {
    const first = evaluateCoinEvent(
      { kind: 'expense_logged', expenseId: 'e-1', categorised: true, isFirstEver: true },
      ctx(),
    );
    assert.ok(first.some((e) => e.ruleId === 'first_expense'));

    const later = evaluateCoinEvent(
      { kind: 'expense_logged', expenseId: 'e-2', categorised: true, isFirstEver: true },
      ctx([], ['first_expense']),
    );
    assert.ok(!later.some((e) => e.ruleId === 'first_expense'));
  });

  it('is idempotent for the same expense, however many times it is replayed', () => {
    const event = {
      kind: 'expense_logged',
      expenseId: 'e-1',
      categorised: true,
      isFirstEver: false,
    } as const;

    const first = evaluateCoinEvent(event, ctx());
    const replay = evaluateCoinEvent(event, ctx(first));
    assert.deepEqual(replay, [], 'a Function retry writes nothing new');
  });
});

describe('weekly runs', () => {
  it('closes on every seventh consecutive day', () => {
    assert.equal(completesWeek(7), true);
    assert.equal(completesWeek(14), true);
    assert.equal(completesWeek(6), false);
    assert.equal(completesWeek(0), false);
  });

  it('awards the run bonus once for the day it closed on', () => {
    const entries = evaluateCoinEvent({ kind: 'week_completed' }, ctx());
    assert.equal(coinBalance(entries), 25);
    assert.deepEqual(evaluateCoinEvent({ kind: 'week_completed' }, ctx(entries)), []);
  });
});

describe('the ledger', () => {
  it('never contains a debit — the balance can only rise', () => {
    const entries = [
      ...evaluateCoinEvent({ kind: 'day_banked', zeroSpend: false }, ctx()),
      ...evaluateCoinEvent(
        { kind: 'expense_logged', expenseId: 'e-1', categorised: true, isFirstEver: true },
        ctx(),
      ),
    ];
    assert.ok(entries.every((e) => e.coins > 0));
    assert.equal(coinBalance(entries), 5 + 10 + 2 + 1);
  });

  it('keeps a realistic day well under the ceiling the docs promise', () => {
    let today: CoinLedgerEntry[] = evaluateCoinEvent({ kind: 'day_banked', zeroSpend: false }, ctx());
    for (let i = 1; i <= 5; i += 1) {
      today = today.concat(
        evaluateCoinEvent(
          { kind: 'expense_logged', expenseId: `e-${i}`, categorised: true, isFirstEver: false },
          ctx(today),
        ),
      );
    }
    assert.equal(coinBalance(today), 14, '5 + 3×2 + 3×1');
  });
});
