import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Expense, formatMoney, money, newPersonalExpense, seedEssentialCategories } from '@loop/shared';

import {
  EMPTY_FILTER,
  type LedgerFilter,
  activeChips,
  fromDrillDown,
  isEmpty,
  matches,
  serverQueryFor,
  validate,
  withoutFacet,
} from './ledger-filter';
import { searchExpenses } from './ledger';

const NOW = '2026-09-16T12:00:00.000Z';
const categories = seedEssentialCategories(NOW);
const categoriesById = new Map(categories.map((c) => [c.id, c]));
const ctx = { categoriesById };
const chipCtx = { categoriesById, currency: 'INR' as const };

const make = (
  id: string,
  minor: number,
  localDate: string,
  categoryId: string,
  description: string,
  source: Expense['source'] = 'manual',
): Expense => ({
  ...newPersonalExpense({
    id,
    uid: 'u',
    total: money(minor, 'INR'),
    categoryId,
    description,
    note: null,
    occurredAt: `${localDate}T06:00:00.000Z`,
    now: NOW,
  }),
  localDate,
  source,
});

const coffee = make('a', 12000, '2026-09-16', 'cat-food', 'Filter coffee');
const cab = make('b', 50000, '2026-09-15', 'cat-transport', 'Cab home', 'sms');
const veg = make('c', 30000, '2026-09-10', 'cat-groceries', 'Vegetables');
const ALL = [coffee, cab, veg];
const ids = (filter: LedgerFilter) => ALL.filter((e) => matches(filter, e, ctx)).map((e) => e.id);
const f = (patch: Partial<LedgerFilter>): LedgerFilter => ({ ...EMPTY_FILTER, ...patch });

describe('matches — each facet alone', () => {
  it('the empty filter matches everything', () => {
    assert.deepEqual(ids(EMPTY_FILTER), ['a', 'b', 'c']);
  });

  it('text matches description and category name, case-insensitive, trimmed', () => {
    assert.deepEqual(ids(f({ text: '  COFFEE ' })), ['a']);
    assert.deepEqual(ids(f({ text: 'transport' })), ['b']);
  });

  it('date range is inclusive on both ends', () => {
    assert.deepEqual(ids(f({ dateRange: { start: '2026-09-10', end: '2026-09-15' } })), ['b', 'c']);
    assert.deepEqual(ids(f({ dateRange: { start: '2026-09-16', end: '2026-09-16' } })), ['a']);
  });

  it('categories: any of the selected', () => {
    assert.deepEqual(ids(f({ categoryIds: ['cat-food', 'cat-groceries'] })), ['a', 'c']);
  });

  it('amount bounds are inclusive minor units', () => {
    assert.deepEqual(ids(f({ amountMin: 30000 })), ['b', 'c']);
    assert.deepEqual(ids(f({ amountMax: 30000 })), ['a', 'c']);
    assert.deepEqual(ids(f({ amountMin: 12000, amountMax: 12000 })), ['a']);
  });

  it('sources', () => {
    assert.deepEqual(ids(f({ sources: ['sms'] })), ['b']);
  });

  it('later-release facets are ignored while empty', () => {
    assert.deepEqual(ids(f({ kinds: [], accountIds: [], tagIds: [], merchantKey: null })), ['a', 'b', 'c']);
  });
});

describe('matches — facets combine with AND', () => {
  it('narrows by every facet at once', () => {
    const filter = f({ dateRange: { start: '2026-09-01', end: '2026-09-30' }, amountMin: 20000, sources: ['manual'] });
    assert.deepEqual(ids(filter), ['c']);
  });

  it('text AND category', () => {
    assert.deepEqual(ids(f({ text: 'cab', categoryIds: ['cat-food'] })), []);
  });
});

describe('searchExpenses still behaves as before (shares matchesText)', () => {
  it('matches the same rows as the text facet', () => {
    assert.deepEqual(searchExpenses(ALL, 'coffee', categoriesById).map((e) => e.id), ids(f({ text: 'coffee' })));
    assert.equal(searchExpenses(ALL, '   ', categoriesById).length, 3);
  });
});

describe('serverQueryFor', () => {
  it('uses the date range (half-open) and one category equality', () => {
    const q = serverQueryFor(f({ dateRange: { start: '2026-09-10', end: '2026-09-15' }, categoryIds: ['cat-food'] }));
    assert.deepEqual(q.dateRange, { start: '2026-09-10', endExclusive: '2026-09-16' });
    assert.deepEqual(q.equality, { field: 'categoryId', value: 'cat-food' });
  });

  it('no equality for zero or several categories', () => {
    assert.equal(serverQueryFor(EMPTY_FILTER).equality, null);
    assert.equal(serverQueryFor(f({ categoryIds: ['cat-food', 'cat-transport'] })).equality, null);
  });

  it('no date range → null (paged scan)', () => {
    assert.equal(serverQueryFor(f({ categoryIds: ['cat-food'] })).dateRange, null);
  });
});

describe('validate / isEmpty', () => {
  it('amountMin > amountMax is invalid; equal is fine', () => {
    assert.deepEqual(validate(f({ amountMin: 5000, amountMax: 4000 })), { ok: false, reason: 'amountRange' });
    assert.deepEqual(validate(f({ amountMin: 4000, amountMax: 4000 })), { ok: true });
    assert.deepEqual(validate(EMPTY_FILTER), { ok: true });
  });

  it('whitespace-only text is still empty', () => {
    assert.equal(isEmpty(f({ text: '   ' })), true);
    assert.equal(isEmpty(f({ sources: ['sms'] })), false);
  });
});

describe('fromDrillDown', () => {
  it('converts the Insights half-open endDate to an inclusive end', () => {
    const filter = fromDrillDown({ categoryId: 'cat-food', startDate: '2026-09-01', endDate: '2026-10-01' });
    assert.deepEqual(filter.dateRange, { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual(filter.categoryIds, ['cat-food']);
  });

  it('a single date becomes a one-day range', () => {
    assert.deepEqual(fromDrillDown({ date: '2026-09-16' }).dateRange, { start: '2026-09-16', end: '2026-09-16' });
  });

  it('no params → empty filter', () => {
    assert.equal(isEmpty(fromDrillDown({})), true);
  });
});

describe('withoutFacet', () => {
  const full = f({
    text: 'x',
    dateRange: { start: '2026-09-01', end: '2026-09-02' },
    categoryIds: ['cat-food'],
    amountMin: 1,
    amountMax: 2,
    sources: ['sms'],
  });

  it('clears exactly one facet to its empty value', () => {
    assert.equal(withoutFacet(full, 'text').text, '');
    assert.equal(withoutFacet(full, 'dateRange').dateRange, null);
    assert.deepEqual(withoutFacet(full, 'categoryIds').categoryIds, []);
    assert.deepEqual(withoutFacet(full, 'sources').sources, []);
    const noAmount = withoutFacet(full, 'amount');
    assert.equal(noAmount.amountMin, null);
    assert.equal(noAmount.amountMax, null);
    assert.equal(noAmount.text, 'x');
  });

  it('removing every chip yields an empty filter', () => {
    const cleared = activeChips(full, chipCtx).reduce((acc, chip) => withoutFacet(acc, chip.facet), full);
    assert.equal(isEmpty(cleared), true);
  });
});

describe('activeChips', () => {
  it('labels each active facet', () => {
    const chips = activeChips(
      f({
        text: 'cab',
        dateRange: { start: '2026-03-12', end: '2026-04-03' },
        categoryIds: ['cat-food'],
        amountMin: 10000,
        amountMax: 250050,
        sources: ['sms', 'manual'],
      }),
      chipCtx,
    );
    assert.deepEqual(
      chips.map((c) => c.facet),
      ['text', 'dateRange', 'categoryIds', 'amount', 'sources'],
    );
    assert.equal(chips[0]?.label, '"cab"');
    assert.equal(chips[1]?.label, '12 MAR – 03 APR');
    assert.equal(chips[2]?.label, categoriesById.get('cat-food')?.name);
    assert.equal(chips[3]?.label, `${formatMoney(money(10000, 'INR'))} – ${formatMoney(money(250050, 'INR'))}`);
    assert.equal(chips[4]?.label, 'SMS, Manual');
  });

  it('amounts use the ledger currency, not minor/100', () => {
    const [chip] = activeChips(f({ amountMin: 500 }), { categoriesById, currency: 'JPY' });
    assert.equal(chip?.label, `≥ ${formatMoney(money(500, 'JPY'))}`);
  });

  it('several categories collapse to a count; empty filter has no chips', () => {
    assert.equal(activeChips(f({ categoryIds: ['a', 'b'] }), chipCtx)[0]?.label, '2 categories');
    assert.deepEqual(activeChips(EMPTY_FILTER, chipCtx), []);
  });
});

describe('v1.2 facets: kind and account (DP8)', () => {
  const v1 = coffee; // no kind field: a v1 expense
  const salary: Expense = { ...make('s', 5_000_000, '2026-09-01', 'cat-food', 'Salary'), kind: 'income', accountId: 'acc-bank' };
  const refund: Expense = { ...make('r', 2_000, '2026-09-02', 'cat-food', 'Refund'), kind: 'refund', refundOf: 'a', accountId: 'acc-card' };
  const topUp: Expense = { ...make('t', 10_000, '2026-09-03', 'sys-transfer', 'Top up'), kind: 'transfer', accountId: 'acc-bank', toAccountId: 'acc-cash' };
  const onCard: Expense = { ...make('k', 7_000, '2026-09-04', 'cat-food', 'Lunch'), accountId: 'acc-card' };
  const TXS = [v1, salary, refund, topUp, onCard];
  const pick = (filter: LedgerFilter) => TXS.filter((e) => matches(filter, e, ctx)).map((e) => e.id);

  it('kind: a v1 expense with no kind counts as Spend', () => {
    assert.deepEqual(pick(f({ kinds: ['expense'] })), ['a', 'k']);
    assert.deepEqual(pick(f({ kinds: ['income', 'refund'] })), ['s', 'r']);
    assert.deepEqual(pick(f({ kinds: ['transfer'] })), ['t']);
  });

  it('account: by id, a transfer on either side, and None for no account', () => {
    assert.deepEqual(pick(f({ accountIds: ['acc-bank'] })), ['s', 't']);
    assert.deepEqual(pick(f({ accountIds: ['acc-cash'] })), ['t']);
    assert.deepEqual(pick(f({ accountIds: ['acc-card'] })), ['r', 'k']);
    assert.deepEqual(pick(f({ accountIds: ['none'] })), ['a']);
    assert.deepEqual(pick(f({ accountIds: ['none', 'acc-card'] })), ['a', 'r', 'k']);
  });

  it('kind and account combine with AND, and with the other facets', () => {
    assert.deepEqual(pick(f({ kinds: ['expense'], accountIds: ['acc-card'] })), ['k']);
    assert.deepEqual(pick(f({ kinds: ['expense'], accountIds: ['acc-card'], amountMin: 8_000 })), []);
  });

  it('server query: one equality, category > kind > account, never kind=expense or account=none', () => {
    assert.deepEqual(serverQueryFor(f({ kinds: ['income'] })).equality, { field: 'kind', value: 'income' });
    assert.deepEqual(serverQueryFor(f({ accountIds: ['acc-bank'] })).equality, { field: 'accountId', value: 'acc-bank' });
    assert.deepEqual(serverQueryFor(f({ categoryIds: ['cat-food'], kinds: ['income'], accountIds: ['acc-bank'] })).equality, { field: 'categoryId', value: 'cat-food' });
    assert.deepEqual(serverQueryFor(f({ kinds: ['income'], accountIds: ['acc-bank'] })).equality, { field: 'kind', value: 'income' });
    assert.deepEqual(serverQueryFor(f({ kinds: ['expense'], accountIds: ['acc-bank'] })).equality, { field: 'accountId', value: 'acc-bank' });
    assert.equal(serverQueryFor(f({ kinds: ['expense'] })).equality, null);
    assert.equal(serverQueryFor(f({ accountIds: ['none'] })).equality, null);
    assert.equal(serverQueryFor(f({ kinds: ['income', 'refund'] })).equality, null);
  });

  it('chips name the kinds and the account; removing a chip clears its facet', () => {
    const accountsById = new Map([['acc-bank', { id: 'acc-bank', name: 'HDFC' } as never]]);
    const chips = activeChips(f({ kinds: ['expense', 'income'], accountIds: ['acc-bank'] }), { ...chipCtx, accountsById });
    assert.deepEqual(chips.map((c) => c.label), ['Spend, Income', 'HDFC']);
    assert.deepEqual(activeChips(f({ accountIds: ['none'] }), chipCtx).map((c) => c.label), ['No account']);
    assert.deepEqual(activeChips(f({ accountIds: ['gone'] }), chipCtx).map((c) => c.label), ['Unknown account']);
    assert.deepEqual(activeChips(f({ accountIds: ['a', 'b'] }), chipCtx).map((c) => c.label), ['2 accounts']);
    assert.deepEqual(withoutFacet(f({ kinds: ['income'], accountIds: ['x'] }), 'kinds'), f({ accountIds: ['x'] }));
    assert.deepEqual(withoutFacet(f({ kinds: ['income'], accountIds: ['x'] }), 'accountIds'), f({ kinds: ['income'] }));
    assert.equal(isEmpty(f({ kinds: ['income'] })), false);
  });
});
