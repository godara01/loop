/**
 * Refund matching tests. See docs/17-money-in-and-out.md § Refund matching.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchRefund, refundableRemainderForExpense } from '../sms/refund-match';
import type { Expense } from '../types';
import type { PendingExpense } from '../sms/types';
import type { CurrencyCode } from '../money';
import type { CategoryColorToken } from '../theme';

function makeExpense(
  id: string,
  amountMinor: number,
  merchantKey: string | null,
  source: 'sms' | 'manual' = 'manual',
  kind: 'expense' | 'refund' | 'transfer' = 'expense',
  refundOf: string | null = null,
  occurredAt: string = '2026-09-12T10:00:00.000Z',
): Expense {
  return {
    id,
    total: { minor: amountMinor, currency: 'INR' },
    categoryId: 'cat-1',
    description: 'test',
    note: null,
    occurredAt,
    localDate: '2026-09-12',
    createdLocalDate: '2026-09-12',
    source,
    receiptPath: null,
    pendingId: null,
    groupId: null,
    paidBy: 'user-1',
    splitMode: 'even',
    allocations: [{ memberId: 'user-1', amount: { minor: amountMinor, currency: 'INR' } }],
    accountId: 'acc-1',
    kind: kind === 'expense' ? undefined : kind,
    refundOf,
    merchantKey,
    merchant: merchantKey ? merchantKey.toUpperCase() : null,
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    deletedAt: null,
  };
}

function makePending(
  id: string,
  amountMinor: number,
  merchantKey: string | null = null,
  accountLast4: string | null = null,
  kind: 'expense' | 'income' | 'refund' | 'transfer' = 'income',
  occurredAt: string = '2026-09-12T10:05:00.000Z',
): PendingExpense {
  return {
    id,
    status: 'pending',
    amountMinor,
    currency: 'INR',
    merchant: merchantKey ? merchantKey.toUpperCase() : null,
    accountLast4,
    occurredAt,
    receivedAt: '2026-09-12T10:06:00.000Z',
    source: 'sms',
    templateId: 'test',
    confidence: 0.9,
    suggestedCategoryId: null,
    suggestionConfidence: null,
    suggestionModelVersion: null,
    expenseId: null,
    displayHint: 'HDFC ••1234',
    kind: kind === 'expense' ? undefined : kind,
    merchantKey,
    suggestedAccountId: null,
    suggestedRefundOf: null,
    pairedPendingId: null,
    createdAt: '2026-09-12T10:06:00.000Z',
    updatedAt: '2026-09-12T10:06:00.000Z',
  };
}

describe('refundableRemainderForExpense', () => {
  it('returns full amount when no refunds exist', () => {
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const remainder = refundableRemainderForExpense(expense, [expense]);
    assert.equal(remainder, 10000);
  });

  it('subtracts already-refunded amounts', () => {
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const refund1 = makeExpense('ref-1', 3000, 'amazon', 'manual', 'refund', 'exp-1');
    const refund2 = makeExpense('ref-2', 2000, 'amazon', 'manual', 'refund', 'exp-1');
    const remainder = refundableRemainderForExpense(expense, [expense, refund1, refund2]);
    assert.equal(remainder, 5000);
  });

  it('ignores refunds for other expenses', () => {
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const otherExpense = makeExpense('exp-2', 5000, 'flipkart');
    const refund = makeExpense('ref-1', 5000, 'flipkart', 'manual', 'refund', 'exp-2');
    const remainder = refundableRemainderForExpense(expense, [expense, otherExpense, refund]);
    assert.equal(remainder, 10000);
  });

  it('ignores refunds from other kinds', () => {
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const refund = makeExpense('ref-1', 5000, 'amazon', 'manual', 'transfer', 'exp-1');
    const remainder = refundableRemainderForExpense(expense, [expense, refund]);
    assert.equal(remainder, 10000);
  });
});

describe('matchRefund', () => {
  it('returns null when no candidates match', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const expense = makeExpense('exp-1', 10000, 'flipkart');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense], accounts);
    assert.equal(result, null);
  });

  it('returns null when pending amount exceeds candidate amount', () => {
    const pending = makePending('pend-1', 15000, 'amazon');
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense], accounts);
    assert.equal(result, null);
  });

  it('returns null when pending amount exceeds refundable remainder', () => {
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const refund = makeExpense('ref-1', 8000, 'amazon', 'manual', 'refund', 'exp-1');
    const pending = makePending('pend-1', 3000, 'amazon');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense, refund], accounts);
    assert.equal(result, null);
  });

  it('returns null when merchantKey does not match', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const expense = makeExpense('exp-1', 10000, 'flipkart');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense], accounts);
    assert.equal(result, null);
  });

  it('returns match when merchantKey matches', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const expense = makeExpense('exp-1', 10000, 'amazon');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-1');
    assert.equal(result!.pending.id, 'pend-1');
  });

  it('prefers exact amount match', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const smallExpense = makeExpense('exp-1', 8000, 'amazon', 'manual', 'expense', null, '2026-09-10T10:00:00.000Z');
    const exactExpense = makeExpense('exp-2', 5000, 'amazon', 'manual', 'expense', null, '2026-09-11T10:00:00.000Z');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [smallExpense, exactExpense], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-2');
  });

  it('prefers same merchant when amounts differ', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const sameMerchantDifferentAmount = makeExpense('exp-1', 6000, 'amazon', 'manual', 'expense', null, '2026-09-10T10:00:00.000Z');
    const differentMerchantExactAmount = makeExpense('exp-2', 5000, 'flipkart', 'manual', 'expense', null, '2026-09-10T10:00:00.000Z');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [sameMerchantDifferentAmount, differentMerchantExactAmount], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-1');
  });

  it('prefers more recent when amounts and merchants match', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const older = makeExpense('exp-1', 5000, 'amazon', 'manual', 'expense', null, '2026-09-10T10:00:00.000Z');
    const newer = makeExpense('exp-2', 5000, 'amazon', 'manual', 'expense', null, '2026-09-12T10:00:00.000Z');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [older, newer], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-2');
  });

  it('ignores refund, transfer, and other non-expense candidates', () => {
    const pending = makePending('pend-1', 5000, 'amazon');
    const refund = makeExpense('exp-1', 10000, 'amazon', 'manual', 'refund');
    const transfer = makeExpense('exp-2', 10000, 'amazon', 'manual', 'transfer');
    const expense = makeExpense('exp-3', 10000, 'amazon');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [refund, transfer, expense], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-3');
  });

  it('handles pending with no merchantKey but from SMS source', () => {
    const pending = makePending('pend-1', 5000, null, '1234');
    const expense = makeExpense('exp-1', 10000, null, 'sms');
    const accounts = [
  { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
];
    const result = matchRefund(pending, [expense], accounts);
    assert.ok(result);
  });

  it('amount-only case: suggests when exactly one candidate', () => {
    const pending = makePending('pend-1', 5000, null, null);
    const expense = makeExpense('exp-1', 10000, null);
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-1');
  });

  it('amount-only case: suggests nothing when multiple candidates', () => {
    const pending = makePending('pend-1', 5000, null, null);
    const expense1 = makeExpense('exp-1', 10000, null, 'manual', 'expense', null, '2026-09-10T10:00:00.000Z');
    const expense2 = makeExpense('exp-2', 8000, null, 'manual', 'expense', null, '2026-09-11T10:00:00.000Z');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [expense1, expense2], accounts);
    assert.equal(result, null);
  });

  it('amount-only case: strong match wins over amount-only', () => {
    const pending = makePending('pend-1', 5000, 'amazon', null);
    const noMerchantExpense = makeExpense('exp-1', 5000, null, 'manual', 'expense', null, '2026-09-12T10:00:00.000Z');
    const merchantMatchExpense = makeExpense('exp-2', 8000, 'amazon', 'manual', 'expense', null, '2026-09-11T10:00:00.000Z');
    const accounts = [
      { id: 'acc-1', name: 'acc1', type: 'bank' as const, last4: '1234', openingBalance: { minor: 0, currency: 'INR' as CurrencyCode }, openingDate: '2026-01-01', colorToken: 'lime' as CategoryColorToken, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }
    ];
    const result = matchRefund(pending, [noMerchantExpense, merchantMatchExpense], accounts);
    assert.ok(result);
    assert.equal(result!.expense.id, 'exp-2');
  });
});
