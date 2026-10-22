import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { money, newPersonalExpense } from '@loop/shared';

import type { PendingExpense } from './approval';
import { badgeCount, bulkApprovable, bulkFromCards, canApproveAll, groupByDay, inboxCards, localDateIn } from './inbox-view';

const item = (id: string, occurredAt: string, status: PendingExpense['status'] = 'pending'): PendingExpense => ({
  id,
  status,
  amountMinor: 10_000,
  currency: 'INR',
  merchant: 'SWIGGY',
  accountLast4: '1234',
  occurredAt,
  receivedAt: occurredAt,
  source: 'sms',
  templateId: 'hdfc-card-debit-v1',
  confidence: 0.9,
  suggestedCategoryId: null,
  suggestionConfidence: null,
  suggestionModelVersion: null,
  expenseId: null,
  displayHint: 'HDFC ••1234 · SWIGGY',
  createdAt: occurredAt,
  updatedAt: occurredAt,
});

describe('badgeCount', () => {
  it('counts pending items only, ignoring approved, rejected and expired', () => {
    const items = [
      item('a', '2026-09-16T04:00:00.000Z'),
      item('b', '2026-09-16T05:00:00.000Z'),
      item('c', '2026-09-16T06:00:00.000Z', 'approved'),
      item('d', '2026-09-16T07:00:00.000Z', 'rejected'),
      item('e', '2026-09-16T08:00:00.000Z', 'expired'),
    ];
    assert.equal(badgeCount(items), 2);
  });

  it('is zero for an empty inbox', () => {
    assert.equal(badgeCount([]), 0);
  });
});

describe('groupByDay', () => {
  it('splits at local midnight, not UTC midnight', () => {
    // Asia/Kolkata is UTC+05:30: 18:29Z is 23:59 IST, 18:30Z is 00:00 the next day.
    const before = item('before', '2026-09-15T18:29:00.000Z');
    const after = item('after', '2026-09-15T18:30:00.000Z');
    const days = groupByDay([before, after], 'Asia/Kolkata');
    assert.deepEqual(
      days.map((d) => [d.date, d.items.map((i) => i.id)]),
      [
        ['2026-09-16', ['after']],
        ['2026-09-15', ['before']],
      ],
    );
    // The same two instants share a day in UTC.
    assert.deepEqual(groupByDay([before, after], 'UTC').map((d) => d.date), ['2026-09-15']);
  });

  it('orders days newest first and items newest first within a day', () => {
    const days = groupByDay(
      [
        item('old', '2026-09-14T04:00:00.000Z'),
        item('morning', '2026-09-16T03:00:00.000Z'),
        item('evening', '2026-09-16T12:00:00.000Z'),
      ],
      'Asia/Kolkata',
    );
    assert.deepEqual(days.map((d) => d.date), ['2026-09-16', '2026-09-14']);
    assert.deepEqual(days[0]!.items.map((i) => i.id), ['evening', 'morning']);
  });

  it('handles a zone behind UTC', () => {
    assert.equal(localDateIn('2026-09-16T03:00:00.000Z', 'America/New_York'), '2026-09-15');
  });

  it('returns no days for an empty inbox', () => {
    assert.deepEqual(groupByDay([], 'UTC'), []);
  });
});

describe('canApproveAll', () => {
  const items = [item('a', '2026-09-16T04:00:00.000Z'), item('b', '2026-09-16T05:00:00.000Z')];

  it('is true when every pending item has a category', () => {
    assert.equal(canApproveAll(items, { a: 'cat-food', b: 'cat-transport' }), true);
  });

  it('is false when any category is missing', () => {
    assert.equal(canApproveAll(items, { a: 'cat-food' }), false);
    assert.equal(canApproveAll(items, { a: 'cat-food', b: '' }), false);
  });

  it('is false when the list is empty', () => {
    assert.equal(canApproveAll([], {}), false);
  });

  it('ignores items that are no longer pending', () => {
    const mixed = [...items, item('done', '2026-09-16T06:00:00.000Z', 'approved')];
    assert.equal(canApproveAll(mixed, { a: 'cat-food', b: 'cat-food' }), true);
    assert.equal(canApproveAll([item('done', '2026-09-16T06:00:00.000Z', 'approved')], {}), false);
  });
});

describe('inboxCards: one card per kind (v1.2, SM3)', () => {
  const NOW = '2026-10-12T10:00:00.000Z';
  const account = (id: string, last4: string) => ({
    id, name: id.toUpperCase(), type: 'bank' as const, last4, openingBalance: money(0, 'INR'), openingDate: '2026-10-01',
    colorToken: 'lime' as const, sortOrder: 0, createdAt: NOW, updatedAt: NOW, archivedAt: null,
  });
  const hdfc = account('hdfc', '1234');
  const sbi = account('sbi', '9876');
  const card = account('card', '5555');
  const accounts = [hdfc, sbi, card];
  const p = (id: string, at: string, overrides: Partial<PendingExpense> = {}): PendingExpense => ({
    id, status: 'pending', amountMinor: 50_000, currency: 'INR', merchant: 'X', accountLast4: '1234', occurredAt: at, receivedAt: at,
    source: 'sms', templateId: 't', confidence: 0.9, suggestedCategoryId: null, suggestionConfidence: null, suggestionModelVersion: null,
    expenseId: null, displayHint: 'h', createdAt: at, updatedAt: at, ...overrides,
  });
  const original = newPersonalExpense({ id: 'e-1', uid: 'u', total: money(99_900, 'INR'), categoryId: 'cat-shopping', description: 'AMAZON', note: null, occurredAt: '2026-10-01T10:00:00.000Z', now: NOW });

  const items = [
    p('debit', '2026-10-12T09:00:00.000Z', { amountMinor: 500_000 }),
    p('credit', '2026-10-12T09:04:00.000Z', { kind: 'income', amountMinor: 500_000, accountLast4: '9876' }),
    p('salary', '2026-10-11T09:00:00.000Z', { kind: 'income', amountMinor: 5_000_000, accountLast4: '9876' }),
    p('refund', '2026-10-10T09:00:00.000Z', { kind: 'refund', amountMinor: 49_900, suggestedRefundOf: 'e-1' }),
    p('orphan-refund', '2026-10-09T09:00:00.000Z', { kind: 'refund', amountMinor: 10_000, suggestedRefundOf: 'e-gone' }),
    p('bill', '2026-10-08T09:00:00.000Z', { kind: 'transfer', amountMinor: 1_200_000, accountLast4: '5555', suggestedAccountId: 'card' }),
    p('lunch', '2026-10-07T09:00:00.000Z', { amountMinor: 30_000 }),
    p('old-approved', '2026-10-06T09:00:00.000Z', { status: 'approved' }),
  ];
  const ctx = { accounts, expensesById: new Map([[original.id, original]]) };

  it('gives each kind its card, newest first, the pair as ONE card', () => {
    const cards = inboxCards(items, ctx);
    assert.deepEqual(cards.map((c) => [c.type, c.id]), [
      ['pair', 'debit|credit'],
      ['income', 'salary'],
      ['refund', 'refund'],
      ['refund', 'orphan-refund'],
      ['transfer', 'bill'],
      ['expense', 'lunch'],
    ]);
  });

  it('fills each card: pair accounts, matched account, refund original or none, the card to pay', () => {
    const cards = inboxCards(items, ctx);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const pair = byId.get('debit|credit')!;
    assert.ok(pair.type === 'pair' && pair.from.id === 'hdfc' && pair.to.id === 'sbi');
    const salary = byId.get('salary')!;
    assert.ok(salary.type === 'income' && salary.account?.id === 'sbi');
    const refund = byId.get('refund')!;
    assert.ok(refund.type === 'refund' && refund.original?.id === 'e-1');
    const orphan = byId.get('orphan-refund')!;
    assert.ok(orphan.type === 'refund' && orphan.original === null);
    const bill = byId.get('bill')!;
    assert.ok(bill.type === 'transfer' && bill.toAccount?.id === 'card');
  });

  it('"Keep separate" splits the pair back into an expense and an income', () => {
    const cards = inboxCards(items, { ...ctx, keptSeparate: new Set(['debit|credit']) });
    assert.deepEqual(cards.slice(0, 2).map((c) => [c.type, c.id]), [['income', 'credit'], ['expense', 'debit']]);
  });

  it('no pair when either account is unknown', () => {
    const cards = inboxCards(items, { ...ctx, accounts: [hdfc] });
    assert.equal(cards.some((c) => c.type === 'pair'), false);
  });

  it('"Approve all" from cards leaves out both halves of a pair', () => {
    assert.deepEqual(bulkFromCards(inboxCards(items, ctx)).map((i) => i.id), ['salary', 'lunch']);
    assert.deepEqual(bulkFromCards(inboxCards(items, { ...ctx, keptSeparate: new Set(['debit|credit']) })).map((i) => i.id), ['credit', 'debit', 'salary', 'lunch']);
  });

  it('"Approve all" covers expenses and income only', () => {
    assert.deepEqual(bulkApprovable(items).map((i) => i.id), ['debit', 'credit', 'salary', 'lunch']);
    const choices = { debit: 'c', credit: 'c', salary: 'c', lunch: 'c' };
    assert.equal(canApproveAll(items, choices), true);
    assert.equal(canApproveAll(items, { ...choices, lunch: undefined }), false);
  });
});
