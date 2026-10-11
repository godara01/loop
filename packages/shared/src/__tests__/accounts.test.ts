/**
 * docs/18-accounts.md: the balance, the marker edit delta, and SMS matching.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_ACCOUNT_NAME_LENGTH,
  accountBalance,
  effectOf,
  matchAccount,
  validateAccountDraft,
  type Account,
  type AccountDraft,
  type AccountFlow,
  type AccountMarkers,
} from '../accounts';
import { money } from '../money';
import type { Expense } from '../types';

const INR = 'INR' as const;
const NOW = '2026-09-23T10:00:00.000Z';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-a',
    name: 'HDFC Salary',
    type: 'bank',
    last4: '1234',
    openingBalance: money(0, INR),
    openingDate: '2026-09-01',
    colorToken: 'lime',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    ...overrides,
  };
}

function draft(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    name: 'HDFC Salary',
    type: 'bank',
    last4: '1234',
    openingBalance: money(0, INR),
    openingDate: '2026-09-01',
    colorToken: 'lime',
    sortOrder: 0,
    ...overrides,
  };
}

function tx(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    kind: 'expense',
    categoryId: 'food',
    total: money(1200, INR),
    description: 'Coffee',
    note: null,
    occurredAt: NOW,
    localDate: '2026-09-23',
    createdLocalDate: '2026-09-23',
    source: 'manual',
    receiptPath: null,
    pendingId: null,
    groupId: null,
    paidBy: 'user-1',
    splitMode: 'even',
    allocations: [],
    accountId: 'acct-a',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function flowOf(docs: readonly Expense[], accountId: string): number {
  let sum = 0;
  for (const doc of docs) {
    for (const flow of effectOf(doc)) {
      if (flow.accountId === accountId) sum += flow.deltaMinor;
    }
  }
  return sum;
}

describe('validateAccountDraft', () => {
  it('accepts a well-formed draft', () => {
    assert.equal(validateAccountDraft(draft()), null);
  });

  it('accepts a cash account with no last4 and a negative (card) opening balance', () => {
    assert.equal(validateAccountDraft(draft({ type: 'cash', last4: null })), null);
    assert.equal(
      validateAccountDraft(draft({ type: 'card', openingBalance: money(-50000, INR) })),
      null,
    );
  });

  it('rejects an empty or over-long name', () => {
    assert.equal(validateAccountDraft(draft({ name: '   ' })), 'name_empty');
    assert.equal(
      validateAccountDraft(draft({ name: 'x'.repeat(MAX_ACCOUNT_NAME_LENGTH + 1) })),
      'name_too_long',
    );
  });

  it('rejects an unknown type', () => {
    assert.equal(validateAccountDraft(draft({ type: 'crypto' as never })), 'type_invalid');
  });

  it('rejects a last4 that is not exactly four digits', () => {
    assert.equal(validateAccountDraft(draft({ last4: '123' })), 'last4_invalid');
    assert.equal(validateAccountDraft(draft({ last4: '12a4' })), 'last4_invalid');
    assert.equal(validateAccountDraft(draft({ last4: '12345' })), 'last4_invalid');
  });

  it('rejects a non-integer opening balance', () => {
    assert.equal(
      validateAccountDraft(draft({ openingBalance: { minor: 12.5, currency: INR } })),
      'opening_balance_invalid',
    );
  });

  it('rejects a malformed opening date', () => {
    assert.equal(validateAccountDraft(draft({ openingDate: '2026/09/01' })), 'opening_date_invalid');
  });

  it('rejects an unknown colour token and a negative sort order', () => {
    assert.equal(validateAccountDraft(draft({ colorToken: 'chartreuse' as never })), 'color_invalid');
    assert.equal(validateAccountDraft(draft({ sortOrder: -1 })), 'sort_order_invalid');
  });
});

describe('effectOf', () => {
  it('debits an expense from its account', () => {
    assert.deepEqual(effectOf(tx({ total: money(100000, INR) })), [
      { accountId: 'acct-a', deltaMinor: -100000 },
    ]);
  });

  it('debits a squad mirror by what the payer actually paid', () => {
    const mirror = tx({ total: money(120000, INR), groupId: 'g1', paidMinor: 120000 });
    const share = tx({ total: money(30000, INR), groupId: 'g1', paidMinor: 120000 });
    assert.deepEqual(effectOf(mirror), [{ accountId: 'acct-a', deltaMinor: -120000 }]);
    assert.deepEqual(effectOf(share), [{ accountId: 'acct-a', deltaMinor: -120000 }]);
  });

  it('credits income and refunds', () => {
    assert.deepEqual(effectOf(tx({ kind: 'income', total: money(500000, INR) })), [
      { accountId: 'acct-a', deltaMinor: 500000 },
    ]);
    assert.deepEqual(effectOf(tx({ kind: 'refund', total: money(20000, INR) })), [
      { accountId: 'acct-a', deltaMinor: 20000 },
    ]);
  });

  it('moves a transfer out of one account and into the other', () => {
    assert.deepEqual(
      effectOf(tx({ kind: 'transfer', total: money(50000, INR), accountId: 'acct-a', toAccountId: 'acct-b' })),
      [
        { accountId: 'acct-a', deltaMinor: -50000 },
        { accountId: 'acct-b', deltaMinor: 50000 },
      ],
    );
  });

  it('ignores a transfer to the same account', () => {
    assert.deepEqual(
      effectOf(tx({ kind: 'transfer', total: money(50000, INR), accountId: 'acct-a', toAccountId: 'acct-a' })),
      [],
    );
  });

  it('reads the direction of a settlement or loan', () => {
    assert.deepEqual(
      effectOf(tx({ kind: 'settlement', total: money(40000, INR), direction: 'out' })),
      [{ accountId: 'acct-a', deltaMinor: -40000 }],
    );
    assert.deepEqual(
      effectOf(tx({ kind: 'settlement', total: money(40000, INR), direction: 'in' })),
      [{ accountId: 'acct-a', deltaMinor: 40000 }],
    );
    assert.deepEqual(
      effectOf(tx({ kind: 'loan', total: money(70000, INR), direction: 'out' })),
      [{ accountId: 'acct-a', deltaMinor: -70000 }],
    );
    assert.deepEqual(
      effectOf(tx({ kind: 'loan', total: money(70000, INR), direction: 'in' })),
      [{ accountId: 'acct-a', deltaMinor: 70000 }],
    );
  });

  it('contributes nothing when no account is set', () => {
    assert.deepEqual(effectOf(tx({ accountId: null })), []);
    assert.deepEqual(effectOf(tx({ kind: 'income', accountId: null })), []);
  });

  it('contributes nothing for a soft-deleted document', () => {
    assert.deepEqual(effectOf(tx({ deletedAt: '2026-09-24T10:00:00.000Z' })), []);
  });
});

describe('accountBalance', () => {
  it('covers the docs/18 acceptance sequence: expense, refund, transfer out', () => {
    const docs = [
      tx({ id: 'e1', total: money(100000, INR) }), // ₹1,000 out
      tx({ id: 'e2', kind: 'refund', total: money(20000, INR) }), // ₹200 in
      tx({ id: 'e3', kind: 'transfer', total: money(50000, INR), accountId: 'acct-a', toAccountId: 'acct-b' }), // ₹500 out
    ];

    // The Functions-side flow sums to −1,300 minor units.
    assert.equal(flowOf(docs, 'acct-a'), -130000);

    const serverFlow: AccountFlow = { accountId: 'acct-a', deltaMinor: 0 };
    const opening = money(0, INR);
    const markers: AccountMarkers = {};

    // Offline: the server has synced nothing yet, so the whole flow is local.
    const beforeSync = accountBalance(opening, serverFlow, docs, markers);
    assert.equal(beforeSync.minor, -130000);

    // After sync: the server flow carries everything and nothing is pending.
    const afterSync = accountBalance(opening, { accountId: 'acct-a', deltaMinor: -130000 }, [], {});
    assert.equal(afterSync.minor, -130000);
    assert.equal(beforeSync.minor, afterSync.minor);
  });

  it('moves a transaction from A to B exactly, against the marker', () => {
    const opening = money(0, INR);
    // The server already applied ₹1,000 to A.
    const marker: AccountMarkers = { e1: [{ accountId: 'acct-a', deltaMinor: -100000 }] };
    // The local document now points at B instead.
    const moved = tx({ id: 'e1', total: money(100000, INR), accountId: 'acct-b' });

    const balanceA = accountBalance(opening, { accountId: 'acct-a', deltaMinor: -100000 }, [moved], marker);
    const balanceB = accountBalance(opening, { accountId: 'acct-b', deltaMinor: 0 }, [moved], marker);

    // A gets its ₹1,000 back, B pays it.
    assert.equal(balanceA.minor, 0);
    assert.equal(balanceB.minor, -100000);
  });

  it('applies the price of an edit as local − marker', () => {
    const opening = money(0, INR);
    const marker: AccountMarkers = { e1: [{ accountId: 'acct-a', deltaMinor: -100000 }] };
    const edited = tx({ id: 'e1', total: money(150000, INR) });

    // Server has −1,000; local is −1,500; only the −500 delta is pending.
    assert.equal(
      accountBalance(opening, { accountId: 'acct-a', deltaMinor: -100000 }, [edited], marker).minor,
      -150000,
    );
  });

  it('takes a soft-deleted document back out of the balance', () => {
    const opening = money(500000, INR);
    const marker: AccountMarkers = { e1: [{ accountId: 'acct-a', deltaMinor: -100000 }] };
    const removed = tx({ id: 'e1', deletedAt: '2026-09-24T10:00:00.000Z' });

    assert.equal(
      accountBalance(opening, { accountId: 'acct-a', deltaMinor: -100000 }, [removed], marker).minor,
      500000,
    );
  });

  it('leaves another account untouched by a pending document', () => {
    const opening = money(0, INR);
    const doc = tx({ total: money(100000, INR), accountId: 'acct-a' });
    assert.equal(accountBalance(opening, { accountId: 'acct-b', deltaMinor: 0 }, [doc], {}).minor, 0);
  });
});

describe('matchAccount', () => {
  it('pre-selects the one active account with that last4', () => {
    assert.equal(matchAccount('1234', [account()])?.id, 'acct-a');
  });

  it('makes no guess when two active accounts share a last4', () => {
    const accounts = [account({ id: 'a' }), account({ id: 'b' })];
    assert.equal(matchAccount('1234', accounts), null);
  });

  it('returns null when nothing matches', () => {
    assert.equal(matchAccount('9999', [account()]), null);
  });

  it('ignores an archived account that matches', () => {
    assert.equal(matchAccount('1234', [account({ archivedAt: NOW })]), null);
  });

  it('returns null for a null or malformed last4', () => {
    assert.equal(matchAccount(null, [account()]), null);
    assert.equal(matchAccount('12', [account({ last4: '12' })]), null);
  });
});
