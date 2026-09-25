import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expenseToDoc, money, parseExpense } from '@loop/shared';

import { ApprovalError, MissingCategoryError, type PendingExpense, buildApproval, buildApproveAll } from './approval';

const UID = 'u';
const NOW = '2026-09-16T12:00:00.000Z';

const pending = (id: string, overrides: Partial<PendingExpense> = {}): PendingExpense => ({
  id,
  status: 'pending',
  amountMinor: 45_000,
  currency: 'INR',
  merchant: 'SWIGGY',
  accountLast4: '1234',
  occurredAt: '2026-09-16T09:58:00.000Z',
  receivedAt: '2026-09-16T09:58:30.000Z',
  source: 'sms',
  templateId: 'hdfc-card-debit-v1',
  confidence: 0.92,
  suggestedCategoryId: null,
  suggestionConfidence: null,
  suggestionModelVersion: null,
  expenseId: null,
  displayHint: 'HDFC ••1234 · SWIGGY',
  createdAt: '2026-09-16T09:58:30.000Z',
  updatedAt: '2026-09-16T09:58:30.000Z',
  ...overrides,
});

describe('buildApproval', () => {
  it('creates an sms expense linked to the pending item, and marks the item approved', () => {
    const { expense, pendingUpdate } = buildApproval(UID, pending('p1'), 'cat-food', {}, NOW);

    assert.equal(expense.source, 'sms');
    assert.equal(expense.pendingId, 'p1');
    assert.deepEqual(expense.total, money(45_000, 'INR'));
    assert.equal(expense.categoryId, 'cat-food');
    assert.equal(expense.description, 'SWIGGY');
    assert.equal(expense.occurredAt, '2026-09-16T09:58:00.000Z');
    assert.equal(expense.paidBy, UID);
    assert.deepEqual(pendingUpdate, { status: 'approved', expenseId: expense.id, updatedAt: NOW });
  });

  it('produces a document the expense converter accepts', () => {
    const { expense } = buildApproval(UID, pending('p1'), 'cat-food', {}, NOW);
    assert.deepEqual(parseExpense(UID, expense.id, expenseToDoc(expense)), expense);
  });

  it('uses the pending id as the expense id, so approving twice cannot duplicate', () => {
    const a = buildApproval(UID, pending('p1'), 'cat-food', {}, NOW);
    const b = buildApproval(UID, pending('p1'), 'cat-food', {}, '2026-09-16T12:00:05.000Z');
    assert.equal(a.expense.id, b.expense.id);
  });

  it('records a pasted message as an sms expense (ExpenseSource has no "pasted")', () => {
    const { expense } = buildApproval(UID, pending('p1', { source: 'pasted' }), 'cat-food', {}, NOW);
    assert.equal(expense.source, 'sms');
    assert.equal(expense.pendingId, 'p1');
  });

  it('keeps a share-sheet item as a shared expense', () => {
    const { expense } = buildApproval(UID, pending('p1', { source: 'shared' }), 'cat-food', {}, NOW);
    assert.equal(expense.source, 'shared');
  });

  it('applies edit-and-approve changes', () => {
    const { expense } = buildApproval(
      UID,
      pending('p1', { merchant: null }),
      'cat-food',
      { total: money(40_000, 'INR'), description: 'Dinner', note: 'split later' },
      NOW,
    );
    assert.equal(expense.total.minor, 40_000);
    assert.equal(expense.allocations[0]!.amount.minor, 40_000);
    assert.equal(expense.description, 'Dinner');
    assert.equal(expense.note, 'split later');
  });

  it('refuses a missing category', () => {
    assert.throws(() => buildApproval(UID, pending('p1'), undefined, {}, NOW), MissingCategoryError);
  });

  it('refuses an item that is no longer pending', () => {
    for (const status of ['approved', 'rejected', 'expired'] as const) {
      assert.throws(() => buildApproval(UID, pending('p1', { status }), 'cat-food', {}, NOW), ApprovalError);
    }
  });

  it('refuses an edit that changes the currency', () => {
    assert.throws(
      () => buildApproval(UID, pending('p1'), 'cat-food', { total: money(100, 'USD') }, NOW),
      ApprovalError,
    );
  });
});

describe('buildApproveAll', () => {
  it('returns one approval per item', () => {
    const items = [pending('p1'), pending('p2', { amountMinor: 1_000 })];
    const approvals = buildApproveAll(UID, items, { p1: 'cat-food', p2: 'cat-transport' }, NOW);
    assert.deepEqual(approvals.map((a) => [a.expense.id, a.expense.categoryId, a.pendingUpdate.expenseId]), [
      ['p1', 'cat-food', 'p1'],
      ['p2', 'cat-transport', 'p2'],
    ]);
  });

  it('throws MissingCategoryError naming every item without a category, and approves none', () => {
    const items = [pending('p1'), pending('p2'), pending('p3')];
    assert.throws(
      () => buildApproveAll(UID, items, { p2: 'cat-food' }, NOW),
      (e: unknown) => e instanceof MissingCategoryError && e.pendingIds.join() === 'p1,p3',
    );
  });
});
