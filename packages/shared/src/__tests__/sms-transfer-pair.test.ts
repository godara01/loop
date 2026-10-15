/**
 * Transfer pairing tests. See docs/17-money-in-and-out.md § Transfer pairing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pairTransfers } from '../sms/transfer-pair';
import type { PendingExpense } from '../sms/types';
import type { Account } from '../accounts';
import type { CurrencyCode } from '../money';
import type { CategoryColorToken } from '../theme';

function makeAccount(
  id: string,
  last4: string | null,
  sortOrder: number = 0,
): Account {
  return {
    id,
    name: `acc-${id}`,
    type: 'bank',
    last4,
    openingBalance: { minor: 0, currency: 'INR' as CurrencyCode },
    openingDate: '2026-01-01',
    colorToken: 'lime' as CategoryColorToken,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
}

function makePending(
  id: string,
  amountMinor: number,
  accountLast4: string | null,
  occurredAt: string,
  kind: 'expense' | 'income' | 'refund' | 'transfer' = 'expense',
): PendingExpense {
  return {
    id,
    status: 'pending',
    amountMinor,
    currency: 'INR',
    merchant: null,
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
    merchantKey: null,
    suggestedAccountId: null,
    suggestedRefundOf: null,
    pairedPendingId: null,
    createdAt: '2026-09-12T10:06:00.000Z',
    updatedAt: '2026-09-12T10:06:00.000Z',
  };
}

describe('pairTransfers', () => {
  it('returns empty when no pendings provided', () => {
    const accounts = [makeAccount('acc-1', '1234')];
    const result = pairTransfers([], accounts);
    assert.deepEqual(result, []);
  });

  it('returns empty when pendings have no accountLast4', () => {
    const pending1 = makePending('pend-1', 5000, null, '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 5000, null, '2026-09-12T10:05:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.deepEqual(result, []);
  });

  it('returns empty when accounts are the same', () => {
    const pending1 = makePending('pend-1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 5000, '1234', '2026-09-12T10:05:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.deepEqual(result, []); // Same account, so no pair
  });

  it('returns empty when amounts differ', () => {
    const pending1 = makePending('pend-1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 6000, '5678', '2026-09-12T10:05:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.deepEqual(result, []);
  });

  it('returns empty when time difference exceeds 10 minutes', () => {
    const pending1 = makePending('pend-1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 5000, '5678', '2026-09-12T10:15:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.deepEqual(result, []);
  });

  it('pairs debit and credit within 10 minutes', () => {
    const pending1 = makePending('pend-1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 5000, '5678', '2026-09-12T10:05:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.debit.id, 'pend-1');
    assert.equal(result[0]!.credit.id, 'pend-2');
  });

  it('pairs within 9 minutes', () => {
    const pending1 = makePending('pend-1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 5000, '5678', '2026-09-12T10:09:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.equal(result.length, 1);
  });

  it('does not pair when exactly 11 minutes apart', () => {
    const pending1 = makePending('pend-1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const pending2 = makePending('pend-2', 5000, '5678', '2026-09-12T10:11:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678')];
    const result = pairTransfers([pending1, pending2], accounts);
    assert.equal(result.length, 0);
  });

  it('prefers closer time matches', () => {
    const debit = makePending('debit', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const closerCredit = makePending('credit1', 5000, '5678', '2026-09-12T10:02:00.000Z', 'income');
    const fartherCredit = makePending('credit2', 5000, '8901', '2026-09-12T10:08:00.000Z', 'income');
    const accounts = [
      makeAccount('acc-1', '1234'),
      makeAccount('acc-2', '5678', 1),
      makeAccount('acc-3', '8901', 2),
    ];
    const result = pairTransfers([debit, closerCredit, fartherCredit], accounts);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.credit.id, 'credit1');
  });

  it('handles multiple pairs correctly', () => {
    const debit1 = makePending('debit1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const credit1 = makePending('credit1', 5000, '5678', '2026-09-12T10:05:00.000Z', 'income');
    const debit2 = makePending('debit2', 3000, '2345', '2026-09-12T11:00:00.000Z', 'expense');
    const credit2 = makePending('credit2', 3000, '6789', '2026-09-12T11:03:00.000Z', 'income');
    const accounts = [
      makeAccount('acc-1', '1234'),
      makeAccount('acc-2', '5678', 1),
      makeAccount('acc-3', '2345', 2),
      makeAccount('acc-4', '6789', 3),
    ];
    const result = pairTransfers([debit1, credit1, debit2, credit2], accounts);
    assert.equal(result.length, 2);
  });

  it('does not pair a pending with multiple credits', () => {
    const debit = makePending('debit', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const credit1 = makePending('credit1', 5000, '5678', '2026-09-12T10:02:00.000Z', 'income');
    const credit2 = makePending('credit2', 5000, '8901', '2026-09-12T10:03:00.000Z', 'income');
    const accounts = [
      makeAccount('acc-1', '1234'),
      makeAccount('acc-2', '5678', 1),
      makeAccount('acc-3', '8901', 2),
    ];
    const result = pairTransfers([debit, credit1, credit2], accounts);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.credit.id, 'credit1');
  });

  it('does not pair a pending with multiple debits', () => {
    const debit1 = makePending('debit1', 5000, '1234', '2026-09-12T10:02:00.000Z', 'expense');
    const debit2 = makePending('debit2', 5000, '2345', '2026-09-12T10:03:00.000Z', 'expense');
    const credit = makePending('credit', 5000, '5678', '2026-09-12T10:05:00.000Z', 'income');
    const accounts = [
      makeAccount('acc-1', '1234'),
      makeAccount('acc-2', '2345', 1),
      makeAccount('acc-3', '5678', 2),
    ];
    const result = pairTransfers([debit1, debit2, credit], accounts);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.debit.id, 'debit1');
  });

  it('handles kind: transfer as credit', () => {
    const debit = makePending('debit', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const transfer = makePending('transfer', 5000, '5678', '2026-09-12T10:05:00.000Z', 'transfer');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678', 1)];
    const result = pairTransfers([debit, transfer], accounts);
    assert.equal(result.length, 1);
  });

  it('handles kind: refund as credit', () => {
    const debit = makePending('debit', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const refund = makePending('refund', 5000, '5678', '2026-09-12T10:05:00.000Z', 'refund');
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '5678', 1)];
    const result = pairTransfers([debit, refund], accounts);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.debit.id, 'debit');
    assert.equal(result[0]!.credit.id, 'refund');
  });

  it('ignores already used pendings', () => {
    const debit1 = makePending('debit1', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const credit1 = makePending('credit1', 5000, '5678', '2026-09-12T10:05:00.000Z', 'income');
    const debit2 = makePending('debit2', 5000, '2345', '2026-09-12T10:00:00.000Z', 'expense');
    const credit2 = makePending('credit2', 5000, '6789', '2026-09-12T10:05:00.000Z', 'income');
    const credit3 = makePending('credit3', 5000, '8901', '2026-09-12T10:06:00.000Z', 'income');
    const accounts = [
      makeAccount('acc-1', '1234'),
      makeAccount('acc-2', '5678', 1),
      makeAccount('acc-3', '2345', 2),
      makeAccount('acc-4', '6789', 3),
      makeAccount('acc-5', '8901', 4),
    ];
    const result = pairTransfers([debit1, credit1, debit2, credit2, credit3], accounts);
    assert.equal(result.length, 2);
  });

  it('returns empty when one pending is on an unknown last4', () => {
    // One pending on a known account, one on an unknown last4 → no pair
    const debit = makePending('debit', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const credit = makePending('credit', 5000, '9999', '2026-09-12T10:05:00.000Z', 'income');
    const accounts = [makeAccount('acc-1', '1234')]; // '9999' is not in accounts
    const result = pairTransfers([debit, credit], accounts);
    assert.equal(result.length, 0);
  });

  it('returns empty when two accounts share the same last4 (ambiguous)', () => {
    const debit = makePending('debit', 5000, '1234', '2026-09-12T10:00:00.000Z', 'expense');
    const credit = makePending('credit', 5000, '5678', '2026-09-12T10:05:00.000Z', 'income');
    // Two accounts share last4 '1234' — matchAccount returns null for ambiguous
    const accounts = [makeAccount('acc-1', '1234'), makeAccount('acc-2', '1234', 1), makeAccount('acc-3', '5678', 2)];
    const result = pairTransfers([debit, credit], accounts);
    assert.equal(result.length, 0);
  });
});
