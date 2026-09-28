/**
 * docs/03: `1000 / 3` style inputs and every currency round-trip through
 * parseAmount → store → formatMoney with zero drift.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { newPersonalExpense } from '../expenses';
import { expenseToDoc, parseExpense } from '../firestore/documents';
import { type CurrencyCode, formatMoney, minorDigits, money, parseAmount } from '../money';
import { splitEvenly } from '../split';

const CURRENCIES: readonly CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP', 'JPY'];
const NOW = '2026-09-28T10:00:00.000Z';

/** A third of 1000 either way, the smallest unit, and large and grouped values. */
function inputsFor(currency: CurrencyCode): string[] {
  return minorDigits(currency) === 0
    ? ['1000', '333', '334', '1', '1,00,000', '99999999']
    : ['1000', '333.33', '333.34', '0.01', '1,00,000.50', '99999999.99'];
}

function store(currency: CurrencyCode, minor: number) {
  const expense = newPersonalExpense({
    id: 'e1',
    uid: 'u1',
    total: money(minor, currency),
    categoryId: 'cat-food',
    description: '',
    note: null,
    occurredAt: NOW,
    now: NOW,
  });
  return parseExpense('u1', 'e1', JSON.parse(JSON.stringify(expenseToDoc(expense)))).total;
}

describe('amount round-trip, every currency', () => {
  for (const currency of CURRENCIES) {
    it(`${currency}: parse → store → format → parse is exact`, () => {
      for (const input of inputsFor(currency)) {
        const parsed = parseAmount(input, currency);
        assert.ok(parsed, `${currency} ${input} parses`);
        const stored = store(currency, parsed.minor);
        assert.deepEqual(stored, parsed, `${currency} ${input} survives the document`);
        assert.ok(Number.isInteger(stored.minor));
        const shown = formatMoney(stored, { showSymbol: false });
        assert.deepEqual(parseAmount(shown, currency), parsed, `${currency} ${input} → "${shown}"`);
      }
    });

    it(`${currency}: 1000 split three ways sums back to 1000 exactly`, () => {
      const total = parseAmount('1000', currency)!;
      const parts = splitEvenly(total, ['a', 'b', 'c']).map((a) => a.amount);
      assert.equal(parts.reduce((s, p) => s + p.minor, 0), total.minor);
      for (const part of parts) assert.deepEqual(store(currency, part.minor), part);
    });
  }
});
