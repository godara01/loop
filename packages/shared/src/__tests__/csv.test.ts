import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildExpensesCsv, majorUnits, parseExpensesCsv } from '../csv';
import { newPersonalExpense, softDeleteExpense } from '../expenses';
import { type CurrencyCode, money, parseAmount } from '../money';
import type { Expense } from '../types';

const NOW = '2026-09-20T10:00:00.000Z';

const expense = (id: string, minor: number, currency: CurrencyCode, description = id, note: string | null = null): Expense =>
  newPersonalExpense({
    id,
    uid: 'u',
    total: money(minor, currency),
    categoryId: 'cat-food',
    description,
    note,
    occurredAt: `2026-09-${String(10 + (id.length % 9)).padStart(2, '0')}T08:00:00.000Z`,
    now: NOW,
  });

function roundTrip(expenses: readonly Expense[]) {
  return parseExpensesCsv(buildExpensesCsv(expenses));
}

describe('CSV export', () => {
  it('round-trips JPY (no minor digits) exactly', () => {
    const [row] = roundTrip([expense('jpy', 12_345, 'JPY')]);
    assert.equal(row!.amountMinor, 12_345);
    assert.equal(row!.amount, '12345');
    assert.equal(row!.currency, 'JPY');
  });

  it('round-trips INR 1,00,00,000.00 exactly', () => {
    const crore = parseAmount('1,00,00,000.00', 'INR')!;
    assert.equal(crore.minor, 1_000_000_000);
    const [row] = roundTrip([expense('crore', crore.minor, 'INR')]);
    assert.equal(row!.amountMinor, 1_000_000_000);
    assert.equal(row!.amount, '10000000.00');
  });

  it('round-trips Number.MAX_SAFE_INTEGER exactly, with an exact display amount', () => {
    const [row] = roundTrip([expense('max', Number.MAX_SAFE_INTEGER, 'INR')]);
    assert.equal(row!.amountMinor, Number.MAX_SAFE_INTEGER);
    assert.equal(row!.amount, '90071992547409.91');
  });

  it('round-trips descriptions with commas, quotes, newlines and emoji', () => {
    const nasty = [
      'Dinner, drinks, dessert',
      'The "good" biryani',
      'Line one\nline two\r\nline three',
      'Chai ☕ + samosa 🥟 with 👨‍👩‍👧 family',
      '"quoted", then, commas\n"and" 🎉',
    ];
    const expenses = nasty.map((description, i) => expense(`d${'x'.repeat(i)}`, 1_000 + i, 'INR', description, description));
    const rows = roundTrip(expenses);
    assert.equal(rows.length, nasty.length);
    for (const e of expenses) {
      const row = rows.find((r) => r.description === e.description);
      assert.ok(row, `lost: ${JSON.stringify(e.description)}`);
      assert.equal(row.amountMinor, e.total.minor);
      assert.equal(row.note, e.note);
    }
  });

  it('excludes soft-deleted expenses', () => {
    const kept = expense('kept', 500, 'INR');
    const gone = softDeleteExpense(expense('gone', 700, 'INR'), NOW);
    const rows = roundTrip([kept, gone]);
    assert.deepEqual(rows.map((r) => r.amountMinor), [500]);
    assert.ok(!buildExpensesCsv([kept, gone]).includes('gone'));
  });

  it('writes RFC 4180: header, CRLF endings, doubled quotes', () => {
    const csv = buildExpensesCsv([expense('q', 100, 'INR', 'say "hi", ok')]);
    const lines = csv.replace('﻿', '').split('\r\n');
    assert.equal(lines[0], 'occurredAt,localDate,amountMinor,currency,amount,categoryId,description,note,source');
    assert.ok(lines[1]!.includes('"say ""hi"", ok"'));
    assert.equal(lines.at(-1), '');
  });

  it('defuses spreadsheet formulas in text cells and restores them on parse', () => {
    const csv = buildExpensesCsv([expense('f', 100, 'INR', '=HYPERLINK("http://x")')]);
    assert.ok(csv.includes(`'=HYPERLINK`));
    assert.equal(parseExpensesCsv(csv)[0]!.description, '=HYPERLINK("http://x")');
  });

  it('prints major units by shifting digits, never through a float', () => {
    assert.equal(majorUnits(5, 'INR'), '0.05');
    assert.equal(majorUnits(1_000, 'USD'), '10.00');
    assert.equal(majorUnits(0, 'JPY'), '0');
    assert.throws(() => majorUnits(1.5, 'INR'));
  });
});
