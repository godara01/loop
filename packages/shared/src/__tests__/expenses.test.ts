/**
 * Personal expenses: built balanced, edited without losing balance or currency,
 * stored flat enough for the rules to check the amount, and read back strictly.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  ExpenseError,
  duplicateExpense,
  editPersonalExpense,
  newPersonalExpense,
  restoreExpense,
  softDeleteExpense,
} from '../expenses';
import { DocumentShapeError, expenseToDoc, parseExpense } from '../firestore/documents';
import { money } from '../money';
import { settleUp } from '../settle';
import { localDateOf } from '../streak';

const UID = 'user-1';
const NOW = '2026-09-16T10:00:00.000Z';
const INR = 'INR' as const;

const coffee = (overrides: Partial<Parameters<typeof newPersonalExpense>[0]> = {}) =>
  newPersonalExpense({
    id: 'e-1',
    uid: UID,
    total: money(12000, INR),
    categoryId: 'cat-food',
    description: '  Filter coffee  ',
    note: '',
    occurredAt: '2026-09-16T04:30:00.000Z',
    now: NOW,
    ...overrides,
  });

describe('localDateOf', () => {
  const originalTz = process.env.TZ;
  before(() => {
    process.env.TZ = 'Asia/Kolkata';
  });
  after(() => {
    process.env.TZ = originalTz;
  });

  it('puts 00:01 IST on the new local day, even though it is still the previous UTC day', () => {
    assert.equal(localDateOf('2026-09-15T18:31:00.000Z'), '2026-09-16');
  });

  it('keeps 23:59 IST on the old local day', () => {
    assert.equal(localDateOf('2026-09-15T18:29:00.000Z'), '2026-09-15');
  });

  it('refuses an unparseable instant', () => {
    assert.throws(() => localDateOf('not a date'));
  });
});

describe('building a personal expense', () => {
  it('is balanced: one allocation to the payer for the whole amount', () => {
    const expense = coffee();
    assert.equal(expense.paidBy, UID);
    assert.deepEqual(expense.allocations, [{ memberId: UID, amount: money(12000, INR) }]);
    assert.equal(expense.groupId, null);
  });

  it('is already a valid settlement input that nets to zero', () => {
    const { balances, transfers } = settleUp([coffee()], INR);
    assert.equal(balances[0]!.net.minor, 0);
    assert.deepEqual(transfers, []);
  });

  it('derives localDate from occurredAt instead of trusting a caller', () => {
    const expense = coffee();
    assert.equal(expense.localDate, localDateOf(expense.occurredAt));
  });

  it('trims the description and stores an empty note as null', () => {
    const expense = coffee();
    assert.equal(expense.description, 'Filter coffee');
    assert.equal(expense.note, null);
  });

  it('rejects zero, negative and fractional amounts', () => {
    assert.throws(() => coffee({ total: money(0, INR) }), ExpenseError);
    assert.throws(() => coffee({ total: money(-100, INR) }), ExpenseError);
    assert.throws(() => coffee({ total: { minor: 12.5, currency: INR } }), ExpenseError);
  });

  it('rejects an expense in the future', () => {
    assert.throws(() => coffee({ occurredAt: '2026-09-17T00:00:00.000Z' }), ExpenseError);
  });
});

describe('editing', () => {
  it('moves the allocation with the total, keeping the expense balanced', () => {
    const edited = editPersonalExpense(coffee(), { total: money(15000, INR) }, NOW);
    assert.deepEqual(edited.allocations, [{ memberId: UID, amount: money(15000, INR) }]);
  });

  it('re-derives localDate when the date changes', () => {
    const edited = editPersonalExpense(coffee(), { occurredAt: '2026-09-14T09:00:00.000Z' }, NOW);
    assert.equal(edited.localDate, localDateOf('2026-09-14T09:00:00.000Z'));
  });

  it('never changes currency or createdAt', () => {
    const original = coffee();
    assert.throws(() => editPersonalExpense(original, { total: money(100, 'USD') }, NOW), ExpenseError);
    const edited = editPersonalExpense(original, { description: 'Espresso' }, '2026-09-16T11:00:00.000Z');
    assert.equal(edited.createdAt, original.createdAt);
    assert.equal(edited.updatedAt, '2026-09-16T11:00:00.000Z');
  });
});

describe('delete, undo, duplicate', () => {
  it('soft-deletes and restores without touching the content', () => {
    const original = coffee();
    const deleted = softDeleteExpense(original, NOW);
    assert.equal(deleted.deletedAt, NOW);
    const restored = restoreExpense(deleted, NOW);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.total.minor, original.total.minor);
  });

  it('duplicates as a fresh manual expense happening now', () => {
    const copy = duplicateExpense(coffee({ source: 'sms', pendingId: 'p-1' }), 'e-2', NOW);
    assert.equal(copy.id, 'e-2');
    assert.equal(copy.occurredAt, NOW);
    assert.equal(copy.source, 'manual');
    assert.equal(copy.pendingId, null);
    assert.equal(copy.deletedAt, null);
  });
});

describe('expense documents', () => {
  it('round-trips exactly', () => {
    const expense = coffee();
    assert.deepEqual(parseExpense(UID, expense.id, expenseToDoc(expense)), expense);
  });

  it('stores the amount flat, where the security rules can check it', () => {
    const doc = expenseToDoc(coffee());
    assert.equal(doc.amountMinor, 12000);
    assert.equal(doc.currency, 'INR');
    assert.ok(!('total' in (doc as unknown as Record<string, unknown>)));
  });

  it('rejects a fractional amount rather than rounding it', () => {
    const doc = { ...expenseToDoc(coffee()), amountMinor: 120.5 };
    assert.throws(() => parseExpense(UID, 'e-1', doc), /amountMinor/);
  });

  it('rejects allocations that do not sum to the amount', () => {
    const doc = { ...expenseToDoc(coffee()), allocations: [{ memberId: UID, amountMinor: 11999 }] };
    assert.throws(
      () => parseExpense(UID, 'e-1', doc),
      (error: unknown) => error instanceof DocumentShapeError && error.field === 'allocations',
    );
  });

  it('rejects a malformed local date and an unknown source', () => {
    assert.throws(() => parseExpense(UID, 'e-1', { ...expenseToDoc(coffee()), localDate: '16/09/2026' }), /localDate/);
    assert.throws(() => parseExpense(UID, 'e-1', { ...expenseToDoc(coffee()), source: 'scraped' }), /source/);
  });

  it('accepts an empty description — it renders as the category name', () => {
    const expense = coffee({ description: '' });
    assert.equal(parseExpense(UID, expense.id, expenseToDoc(expense)).description, '');
  });
});
