import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expenseToDoc, firestorePaths, money, newPersonalExpense, newRefund, parseExpense } from '@loop/shared';

import {
  ApprovalError,
  MissingCategoryError,
  type PendingExpense,
  buildApproval,
  buildApproveAll,
  buildMergeApproval,
  buildRefundApproval,
  buildTransferApproval,
  planApprovalWrites,
} from './approval';

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

describe('approval per kind (v1.2, SM3)', () => {
  const original = newPersonalExpense({
    id: 'e-amazon', uid: UID, total: money(100_000, 'INR'), categoryId: 'cat-shopping', description: 'AMAZON', note: null,
    occurredAt: '2026-09-10T10:00:00.000Z', now: NOW, accountId: 'acc-card',
  });

  it('income: an income doc on the suggested account, unless the card picked another or none', () => {
    const credit = pending('p-in', { kind: 'income', merchant: 'ACME', suggestedAccountId: 'acc-bank' });
    const { expense } = buildApproval(UID, credit, 'cat-salary', {}, NOW);
    assert.equal(expense.kind, 'income');
    assert.equal(expense.accountId, 'acc-bank');
    assert.equal(buildApproval(UID, credit, 'cat-salary', { accountId: 'acc-cash' }, NOW).expense.accountId, 'acc-cash');
    assert.equal(buildApproval(UID, credit, 'cat-salary', { accountId: null }, NOW).expense.accountId ?? null, null);
  });

  it('an expense keeps the v1 shape plus the suggested account', () => {
    const { expense } = buildApproval(UID, pending('p-x', { suggestedAccountId: 'acc-card' }), 'cat-food', {}, NOW);
    assert.equal(expense.kind ?? 'expense', 'expense');
    assert.equal(expense.accountId, 'acc-card');
  });

  it("refund 'Yes': linked to the original, its category, within the remainder", () => {
    const refund = pending('p-ref', { kind: 'refund', amountMinor: 49_900, merchant: 'AMAZON', suggestedRefundOf: 'e-amazon', suggestedAccountId: 'acc-card' });
    const { expense, pendingUpdate } = buildRefundApproval(UID, refund, original, [], NOW);
    assert.equal(expense.kind, 'refund');
    assert.equal(expense.refundOf, 'e-amazon');
    assert.equal(expense.categoryId, 'cat-shopping');
    assert.equal(expense.accountId, 'acc-card');
    assert.equal(expense.id, 'p-ref');
    assert.deepEqual(pendingUpdate, { status: 'approved', expenseId: 'p-ref', updatedAt: NOW });
  });

  it('refund: refuses more than is left to refund', () => {
    const earlier = newRefund({ id: 'r-0', uid: UID, total: money(60_000, 'INR'), categoryId: 'cat-shopping', description: 'part', note: null, occurredAt: NOW, now: NOW, refundOf: 'e-amazon' });
    const refund = pending('p-ref', { kind: 'refund', amountMinor: 49_900 });
    assert.throws(() => buildRefundApproval(UID, refund, original, [earlier], NOW), ApprovalError);
  });

  it("\"It's income\": a refund proposal approved as income", () => {
    const refund = pending('p-ref', { kind: 'refund', amountMinor: 49_900, suggestedRefundOf: 'e-amazon' });
    assert.throws(() => buildApproval(UID, refund, 'cat-other-in', {}, NOW), ApprovalError);
    const { expense } = buildApproval(UID, refund, 'cat-other-in', { asIncome: true }, NOW);
    assert.equal(expense.kind, 'income');
    assert.equal(expense.refundOf ?? null, null);
  });

  it('card bill: a transfer from the picked account to the card', () => {
    const bill = pending('p-bill', { kind: 'transfer', amountMinor: 1_200_000, merchant: null });
    const { expense } = buildTransferApproval(UID, bill, 'acc-bank', 'acc-card', NOW);
    assert.equal(expense.kind, 'transfer');
    assert.deepEqual([expense.accountId, expense.toAccountId], ['acc-bank', 'acc-card']);
  });

  describe('merge: one transfer, both pendings, one batch', () => {
    const debit = pending('p-debit', { amountMinor: 500_000, accountLast4: '1234' });
    const credit = pending('p-credit', { kind: 'income', amountMinor: 500_000, accountLast4: '9876', occurredAt: '2026-09-16T10:02:00.000Z' });

    it('builds ONE transfer doc and approves both pendings pointing at it', () => {
      const approval = buildMergeApproval(UID, { debit, credit }, 'acc-hdfc', 'acc-sbi', NOW);
      assert.equal(approval.expense.kind, 'transfer');
      assert.equal(approval.expense.id, 'p-debit');
      assert.deepEqual([approval.expense.accountId, approval.expense.toAccountId], ['acc-hdfc', 'acc-sbi']);
      assert.deepEqual(approval.alsoApproves, ['p-credit']);
    });

    it('plans the transfer and both pending updates in a single batch', () => {
      const batches = planApprovalWrites(UID, [buildMergeApproval(UID, { debit, credit }, 'acc-hdfc', 'acc-sbi', NOW)]);
      assert.equal(batches.length, 1);
      assert.deepEqual(batches[0]!.map((op) => [op.op, op.path]), [
        ['set', firestorePaths.expense(UID, 'p-debit')],
        ['update', firestorePaths.pendingExpense(UID, 'p-debit')],
        ['update', firestorePaths.pendingExpense(UID, 'p-credit')],
      ]);
      assert.deepEqual(batches[0]![2]!.data, { status: 'approved', expenseId: 'p-debit', updatedAt: NOW });
    });

    it('refuses halves of different amounts', () => {
      assert.throws(() => buildMergeApproval(UID, { debit, credit: { ...credit, amountMinor: 1 } }, 'a', 'b', NOW), ApprovalError);
    });

    it('never splits an approval across batches: a 3-op merge starts a new batch instead', () => {
      const singles = Array.from({ length: 249 }, (_, i) => buildApproval(UID, pending(`s${i}`), 'cat-food', {}, NOW)); // 498 ops
      const batches = planApprovalWrites(UID, [...singles, buildMergeApproval(UID, { debit, credit }, 'a', 'b', NOW)]);
      assert.deepEqual(batches.map((b) => b.length), [498, 3]);
    });
  });
});
