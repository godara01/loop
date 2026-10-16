import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildExpensesCsv, CSV_COLUMNS, majorUnits, parseExpensesCsv } from '../csv';
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
    const lines = csv.split('\r\n');
    assert.equal(lines[0]!.replace('', ''), CSV_COLUMNS.join(','));
    assert.ok(lines[1]!.includes('"say ""hi"", ok"'));
    assert.equal(lines.at(-1), '');
  });

  it('defuses spreadsheet formulas in text cells and restores them on parse', () => {
    const csv = buildExpensesCsv([expense('f', 100, 'INR', '=HYPERLINK("http://x")')]);
    assert.ok(csv.includes(`'=HYPERLINK`));
    assert.equal(parseExpensesCsv(csv)[0]!.description, '=HYPERLINK("http://x")');
  });

  it('round-trips v2 columns (kind, account, toAccount, refundOf, merchant, tags, lines, recurring)', () => {
    const e = {
      ...expense('v2', 1234, 'INR', 'Lunch'),
      kind: 'transfer' as const,
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      refundOf: 'ref-1',
      merchant: 'Swiggy',
      tagIds: ['food', 'weekend'],
      lines: [{ categoryId: 'cat-1', amountMinor: 500 }, { categoryId: 'cat-2', amountMinor: 734 }],
    };
    const [row] = roundTrip([e]);
    assert.equal(row!.kind, 'transfer');
    assert.equal(row!.account, '');
    assert.equal(row!.toAccount, '');
    assert.equal(row!.refundOf, 'ref-1');
    assert.equal(row!.merchant, 'Swiggy');
    assert.equal(row!.tags, 'food;weekend');
    assert.equal(row!.lines, 'cat-1:500|cat-2:734');
  });

  it('exports account and toAccount by name, empty for none or an unknown id (AC4)', () => {
    const names = new Map([['acc-1', 'HDFC, Salary'], ['acc-2', 'Cash']]);
    const rows = parseExpensesCsv(
      buildExpensesCsv(
        [
          { ...expense('t', 100, 'INR', 'Top up'), kind: 'transfer' as const, accountId: 'acc-1', toAccountId: 'acc-2' },
          { ...expense('u', 200, 'INR', 'Unassigned') },
          { ...expense('g', 300, 'INR', 'Gone'), accountId: 'acc-deleted' },
        ],
        names,
      ),
    );
    // Same instant, so rows come out in id order: g, t, u.
    assert.deepEqual(rows.map((r) => [r.description, r.account, r.toAccount]), [
      ['Gone', '', ''],
      ['Top up', 'HDFC, Salary', 'Cash'],
      ['Unassigned', '', ''],
    ]);
  });

  it('parses legacy v1 CSV files successfully', () => {
    const v1Csv = 'occurredAt,localDate,amountMinor,currency,amount,categoryId,description,note,source\r\n2026-09-10T08:00:00.000Z,2026-09-10,1000,INR,10.00,cat-food,Biryani,,manual\r\n';
    const rows = parseExpensesCsv(v1Csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.amountMinor, 1000);
    assert.equal(rows[0]!.description, 'Biryani');
    assert.equal(rows[0]!.kind, '');
  });
});
