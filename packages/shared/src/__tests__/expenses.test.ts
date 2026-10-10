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
  newIncome,
  newPersonalExpense,
  newRefund,
  newTransfer,
  restoreExpense,
  softDeleteExpense,
  validateTransaction,
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

  it('sets createdLocalDate from the creation timestamp', () => {
    const expense = coffee();
    assert.equal(expense.createdLocalDate, localDateOf(expense.createdAt));
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

  it('preserves createdLocalDate when editing', () => {
    const original = coffee();
    const edited = editPersonalExpense(original, { description: 'Espresso' }, '2026-09-16T11:00:00.000Z');
    assert.equal(edited.createdLocalDate, original.createdLocalDate);
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

  it('sets a new createdLocalDate when duplicating', () => {
    const copy = duplicateExpense(coffee(), 'e-2', NOW);
    assert.equal(copy.createdLocalDate, localDateOf(NOW));
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

  it('parses v1 documents without createdLocalDate as null', () => {
    const doc = expenseToDoc(coffee());
    const { createdLocalDate, ...v1Doc } = doc;
    const parsed = parseExpense(UID, 'e-1', v1Doc);
    assert.equal(parsed.createdLocalDate, null);
  });

  it('round-trips createdLocalDate correctly', () => {
    const expense = coffee();
    const parsed = parseExpense(UID, expense.id, expenseToDoc(expense));
    assert.equal(parsed.createdLocalDate, expense.createdLocalDate);
  });

  it('rejects malformed createdLocalDate', () => {
    const doc = { ...expenseToDoc(coffee()), createdLocalDate: 'not-a-date' };
    assert.throws(() => parseExpense(UID, 'e-1', doc), /createdLocalDate/);
  });
});

describe('validateTransaction and K1 transaction constructors', () => {
  it('newPersonalExpense creates an expense with kind defaulting to expense', () => {
    const exp = coffee();
    assert.equal(exp.kind ?? 'expense', 'expense');
  });

  it('newIncome creates valid income transaction with optional fields', () => {
    const inc = newIncome({
      id: 'inc-1',
      uid: UID,
      total: money(500000, INR),
      categoryId: 'cat-salary',
      description: 'Monthly Salary',
      note: null,
      occurredAt: '2026-09-15T10:00:00.000Z',
      now: NOW,
      accountId: 'acc-bank',
      merchant: 'Acme Corp',
      merchantKey: 'acme_corp',
    });
    assert.equal(inc.kind, 'income');
    assert.equal(inc.categoryId, 'cat-salary');
    assert.equal(inc.accountId, 'acc-bank');
    assert.equal(inc.merchant, 'Acme Corp');
    assert.equal(inc.merchantKey, 'acme_corp');
  });

  it('newIncome validates category type if category provided', () => {
    assert.throws(
      () =>
        newIncome(
          {
            id: 'inc-2',
            uid: UID,
            total: money(1000, INR),
            categoryId: 'cat-food',
            description: 'Invalid Income',
            note: null,
            occurredAt: NOW,
            now: NOW,
          },
          { type: 'expense' },
        ),
      /Income requires an income category/,
    );
  });

  it('newTransfer creates valid transfer with sys-transfer category and diff accounts', () => {
    const trf = newTransfer({
      id: 'trf-1',
      uid: UID,
      total: money(20000, INR),
      description: 'Self Transfer',
      note: null,
      occurredAt: NOW,
      now: NOW,
      accountId: 'acc-1',
      toAccountId: 'acc-2',
    });
    assert.equal(trf.kind, 'transfer');
    assert.equal(trf.categoryId, 'sys-transfer');
    assert.equal(trf.accountId, 'acc-1');
    assert.equal(trf.toAccountId, 'acc-2');
  });

  it('newTransfer fails if accountId and toAccountId are identical', () => {
    assert.throws(
      () =>
        newTransfer({
          id: 'trf-2',
          uid: UID,
          total: money(20000, INR),
          description: 'Self Transfer',
          note: null,
          occurredAt: NOW,
          now: NOW,
          accountId: 'acc-1',
          toAccountId: 'acc-1',
        }),
      /Transfer accounts must differ/,
    );
  });

  it('newRefund creates valid refund with refundOf reference', () => {
    const ref = newRefund({
      id: 'ref-1',
      uid: UID,
      total: money(12000, INR),
      categoryId: 'cat-food',
      description: 'Coffee refund',
      note: null,
      occurredAt: NOW,
      now: NOW,
      refundOf: 'e-1',
    });
    assert.equal(ref.kind, 'refund');
    assert.equal(ref.refundOf, 'e-1');
  });

  it('newRefund fails if refundOf is missing', () => {
    assert.throws(
      () =>
        newRefund({
          id: 'ref-2',
          uid: UID,
          total: money(12000, INR),
          categoryId: 'cat-food',
          description: 'Coffee refund',
          note: null,
          occurredAt: NOW,
          now: NOW,
          refundOf: '',
        }),
      /Refund requires refundOf/,
    );
  });

  it('validateTransaction enforces rules for each kind correctly', () => {
    // Valid cases
    assert.doesNotThrow(() => validateTransaction({ kind: 'expense', categoryId: 'cat-1' }));
    assert.doesNotThrow(() => validateTransaction({ kind: 'transfer', categoryId: 'sys-transfer', accountId: 'a', toAccountId: 'b' }));
    assert.doesNotThrow(() => validateTransaction({ kind: 'refund', categoryId: 'cat-1', refundOf: 'ref-id' }));
    assert.doesNotThrow(() => validateTransaction({ kind: 'income', categoryId: 'cat-salary' }));

    // Invalid cases
    assert.throws(
      () => validateTransaction({ kind: 'transfer', categoryId: 'sys-transfer', accountId: 'a', toAccountId: 'a' }),
      /Transfer accounts must differ/,
    );
    assert.throws(
      () => validateTransaction({ kind: 'transfer', categoryId: 'sys-transfer', accountId: 'a' }),
      /Transfer requires both accountId and toAccountId/,
    );
    assert.throws(
      () => validateTransaction({ kind: 'refund', categoryId: 'cat-1', refundOf: '' }),
      /Refund requires refundOf/,
    );
    assert.throws(
      () => validateTransaction({ kind: 'income', categoryId: 'sys-transfer' }),
      /Income requires an income category/,
    );
  });
});
