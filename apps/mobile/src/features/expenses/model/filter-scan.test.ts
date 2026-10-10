import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Expense, addDays, money, newPersonalExpense, seedEssentialCategories } from '@loop/shared';

import { EMPTY_FILTER, type LedgerFilter } from './ledger-filter';
import { type Page, scanPages } from './filter-scan';

const NOW = '2026-09-16T12:00:00.000Z';
const categories = seedEssentialCategories(NOW);
const ctx = { categoriesById: new Map(categories.map((c) => [c.id, c])) };

/** Newest first: index 0 is today, index n is n days back. */
const dayOf = (index: number) => addDays('2026-09-16', -index);

const make = (index: number, categoryId: string): Expense => {
  const localDate = dayOf(index);
  return {
    ...newPersonalExpense({
      id: `e${index}`,
      uid: 'u',
      total: money(10000 + index, 'INR'),
      categoryId,
      description: `Row ${index}`,
      note: null,
      occurredAt: `${localDate}T06:00:00.000Z`,
      now: NOW,
    }),
    localDate,
  };
};

/** `every`: 1 = all rows are food, 20 = every twentieth row is food. */
const source = (count: number, every = 1): Expense[] =>
  Array.from({ length: count }, (_, i) => make(i, i % every === 0 ? 'cat-food' : 'cat-transport'));

/** A paged source over an array; the cursor is the index to resume at. */
function pager(items: readonly Expense[], pageSize: number) {
  let calls = 0;
  const fetchPage = async (cursor: number | null): Promise<Page<number>> => {
    calls += 1;
    const start = cursor ?? 0;
    const end = start + pageSize;
    return { items: items.slice(start, end), next: end >= items.length ? null : end };
  };
  return { fetchPage, pages: () => calls };
}

const food: LedgerFilter = { ...EMPTY_FILTER, categoryIds: ['cat-food'] };

describe('scanPages — stopping conditions', () => {
  it('stops once it has targetMatches matches', async () => {
    const { fetchPage, pages } = pager(source(500), 50);

    const result = await scanPages(fetchPage, food, ctx);

    assert.equal(pages(), 1);
    assert.equal(result.matches.length, 50);
    assert.equal(result.complete, false);
    assert.equal(result.next, 50);
    assert.equal(result.scannedBackTo, dayOf(49));
  });

  it('stops at maxPages with complete=false and the oldest date read', async () => {
    const { fetchPage, pages } = pager(source(600, 20), 50);

    const result = await scanPages(fetchPage, food, ctx);

    assert.equal(pages(), 10);
    assert.equal(result.matches.length, 25);
    assert.equal(result.complete, false);
    assert.equal(result.next, 500);
    assert.equal(result.scannedBackTo, dayOf(499));
  });

  it('honours explicit targetMatches and maxPages', async () => {
    const { fetchPage, pages } = pager(source(500), 10);

    const result = await scanPages(fetchPage, food, ctx, { targetMatches: 25, maxPages: 2 });

    assert.equal(pages(), 2);
    assert.equal(result.matches.length, 20);
    assert.equal(result.complete, false);
    assert.equal(result.scannedBackTo, dayOf(19));
  });

  it('returns every match in the pages it fetched, not just targetMatches', async () => {
    const { fetchPage } = pager(source(500), 120);

    const result = await scanPages(fetchPage, food, ctx);

    assert.equal(result.matches.length, 120);
  });
});

describe('scanPages — completeness', () => {
  it('is complete when the source runs out before the budget', async () => {
    const { fetchPage, pages } = pager(source(120, 40), 50);

    const result = await scanPages(fetchPage, food, ctx);

    assert.equal(pages(), 3);
    assert.deepEqual(
      result.matches.map((e) => e.id),
      ['e0', 'e40', 'e80'],
    );
    assert.equal(result.complete, true);
    assert.equal(result.next, null);
    assert.equal(result.scannedBackTo, dayOf(119));
  });

  it('is complete when the last page exactly empties the source', async () => {
    const { fetchPage, pages } = pager(source(100, 50), 50);

    const result = await scanPages(fetchPage, food, ctx);

    assert.equal(pages(), 2);
    assert.equal(result.complete, true);
    assert.equal(result.next, null);
    assert.equal(result.scannedBackTo, dayOf(99));
  });

  it('reports no scanned date for an empty source', async () => {
    const { fetchPage, pages } = pager([], 50);

    const result = await scanPages(fetchPage, food, ctx);

    assert.equal(pages(), 1);
    assert.deepEqual(result.matches, []);
    assert.equal(result.complete, true);
    assert.equal(result.scannedBackTo, null);
    assert.equal(result.next, null);
  });
});

describe('scanPages — resuming', () => {
  it('continues from the previous next cursor without repeating rows', async () => {
    const items = source(100);
    const first = await scanPages(pager(items, 5).fetchPage, food, ctx, { targetMatches: 10 });

    assert.equal(first.next, 10);
    assert.equal(first.matches.length, 10);

    const second = await scanPages(pager(items, 5).fetchPage, food, ctx, {
      targetMatches: 10,
      startCursor: first.next,
    });

    assert.deepEqual(
      second.matches.map((e) => e.id),
      ['e10', 'e11', 'e12', 'e13', 'e14', 'e15', 'e16', 'e17', 'e18', 'e19'],
    );
    assert.equal(second.next, 20);
    assert.equal(second.complete, false);
    assert.equal(second.scannedBackTo, dayOf(19));
  });

  it('resumes to the end of the source', async () => {
    const items = source(12);
    const { fetchPage, pages } = pager(items, 5);

    const result = await scanPages(fetchPage, food, ctx, { targetMatches: 3, startCursor: 10 });

    assert.equal(pages(), 1);
    assert.deepEqual(
      result.matches.map((e) => e.id),
      ['e10', 'e11'],
    );
    assert.equal(result.complete, true);
    assert.equal(result.next, null);
  });
});

describe('scanPages — the empty filter', () => {
  it('keeps every item', async () => {
    const { fetchPage, pages } = pager(source(7, 3), 3);

    const result = await scanPages(fetchPage, EMPTY_FILTER, ctx);

    assert.equal(pages(), 3);
    assert.deepEqual(
      result.matches.map((e) => e.id),
      ['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'],
    );
    assert.equal(result.complete, true);
    assert.equal(result.scannedBackTo, dayOf(6));
  });
});
