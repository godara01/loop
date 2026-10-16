import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Expense, money, newPersonalExpense, seedEssentialCategories } from '@loop/shared';

import { EMPTY_FILTER, type LedgerFilter } from './ledger-filter';
import { ledgerSource, ledgerSummary, scannedBackLabel, summaryLine } from './ledger-view';

const NOW = '2026-09-16T12:00:00.000Z';
const categories = seedEssentialCategories(NOW);

const expense = (id: string, minor: number, localDate = '2026-09-16'): Expense => ({
  ...newPersonalExpense({
    id,
    uid: 'u',
    total: money(minor, 'INR'),
    categoryId: 'cat-food',
    description: id,
    note: null,
    occurredAt: `${localDate}T06:00:00.000Z`,
    now: NOW,
  }),
  localDate,
});

describe('ledgerSource', () => {
  it('uses the plain live list when nothing is filtered', () => {
    assert.deepEqual(ledgerSource(EMPTY_FILTER), { kind: 'recent' });
  });

  it('loads the whole range when a date range is set, half-open at the end', () => {
    const filter: LedgerFilter = { ...EMPTY_FILTER, dateRange: { start: '2026-03-01', end: '2026-03-31' } };

    assert.deepEqual(ledgerSource(filter), { kind: 'range', start: '2026-03-01', endExclusive: '2026-04-01' });
  });

  it('prefers the range even when other facets are set, because the range bounds the read', () => {
    const filter: LedgerFilter = {
      ...EMPTY_FILTER,
      dateRange: { start: '2026-03-01', end: '2026-03-01' },
      categoryIds: ['cat-food'],
      text: 'coffee',
      amountMin: 500,
    };

    assert.deepEqual(ledgerSource(filter), { kind: 'range', start: '2026-03-01', endExclusive: '2026-03-02' });
  });

  it('scans pages for a filter with no date range', () => {
    for (const filter of [
      { ...EMPTY_FILTER, text: 'coffee' },
      { ...EMPTY_FILTER, categoryIds: ['cat-food'] },
      { ...EMPTY_FILTER, amountMax: 10_000 },
      { ...EMPTY_FILTER, sources: ['sms' as const] },
    ]) {
      assert.deepEqual(ledgerSource(filter), { kind: 'scan' }, JSON.stringify(filter));
    }
  });

  it('treats whitespace-only text as no filter at all', () => {
    assert.deepEqual(ledgerSource({ ...EMPTY_FILTER, text: '   ' }), { kind: 'recent' });
  });
});

describe('ledgerSummary', () => {
  it('counts the rows and sums their totals', () => {
    const summary = ledgerSummary([expense('a', 1_000), expense('b', 2_500)], 'INR', true);

    assert.equal(summary.count, 2);
    assert.deepEqual(summary.total, money(3_500, 'INR'));
    assert.equal(summary.complete, true);
  });

  it('is zero in the filter currency when nothing matched', () => {
    assert.deepEqual(ledgerSummary([], 'INR', true).total, money(0, 'INR'));
  });

  it('carries the incomplete flag through', () => {
    assert.equal(ledgerSummary([expense('a', 1_000)], 'INR', false).complete, false);
  });
});

describe('summaryLine', () => {
  it('reads "42 transactions · ₹18,240.00 spent" when complete', () => {
    const summary = { count: 42, total: money(1_824_000, 'INR'), complete: true };

    assert.equal(summaryLine(summary), '42 transactions · ₹18,240.00 spent');
  });

  it('prefixes both the count and the total with ≥ when incomplete', () => {
    const summary = { count: 50, total: money(1_824_000, 'INR'), complete: false };

    assert.equal(summaryLine(summary), '≥ 50 transactions · ≥ ₹18,240.00 spent');
  });

  it('says "1 transaction", not "1 transactions"', () => {
    assert.equal(summaryLine({ count: 1, total: money(500, 'INR'), complete: true }), '1 transaction · ₹5.00 spent');
  });

  it('still reads as a sentence with no matches', () => {
    assert.equal(summaryLine({ count: 0, total: money(0, 'INR'), complete: true }), '0 transactions · ₹0.00 spent');
  });
});

describe('scannedBackLabel', () => {
  it('formats the oldest row read', () => {
    assert.equal(scannedBackLabel('2026-03-12'), 'Scanned back to 12 Mar 2026');
  });

  it('is null when the scan read nothing', () => {
    assert.equal(scannedBackLabel(null), null);
  });

  it('reads the date as local, never shifted by the device timezone', () => {
    // 1 Jan would become 31 Dec of the previous year if it went through a
    // timezone behind UTC.
    assert.equal(scannedBackLabel('2026-01-01'), 'Scanned back to 01 Jan 2026');
  });
});

describe('seeded categories', () => {
  it('has the food category the other tests filter on', () => {
    assert.ok(categories.some((category) => category.id === 'cat-food'));
  });
});

describe('summary with v1.2 kinds (DP8 device run)', () => {
  it('states spend and income separately and never adds them', () => {
    const rows = [
      expense('a', 4_000),
      { ...expense('s', 100_000), kind: 'income' as const },
      { ...expense('r', 1_000), kind: 'refund' as const },
      { ...expense('t', 50_000), kind: 'transfer' as const },
    ];
    const summary = ledgerSummary(rows, 'INR', true);
    assert.deepEqual(summary.total, money(3_000, 'INR'));
    assert.deepEqual(summary.income, money(100_000, 'INR'));
    assert.equal(summaryLine(summary), '4 transactions · ₹30.00 spent · ₹1,000.00 in');
    assert.equal(summaryLine({ ...summary, complete: false }), '≥ 4 transactions · ≥ ₹30.00 spent · ≥ ₹1,000.00 in');
  });
});
