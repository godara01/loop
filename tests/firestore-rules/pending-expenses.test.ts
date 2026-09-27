/**
 * pendingExpenses rules. Valid documents come from the same converter the app
 * uses (P1), so these prove both the refusals and that the app's own writes
 * pass. Its own project id: rules test files run in parallel, and each
 * clears its database between tests.
 */

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc, writeBatch } from 'firebase/firestore';

import { expenseToDoc, pendingExpenseToDoc } from '../../packages/shared/src/firestore/documents';
import { firestorePaths as p } from '../../packages/shared/src/firestore/paths';
import { newPersonalExpense } from '../../packages/shared/src/expenses';
import { money } from '../../packages/shared/src/money';
import type { PendingExpense } from '../../packages/shared/src/sms/types';

const NOW = '2026-09-13T10:00:00.000Z';
const ALICE = 'alice';
const BOB = 'bob';
const ID = 'pending-1';

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore();

const pending: PendingExpense = {
  id: ID,
  status: 'pending',
  amountMinor: 45_000,
  currency: 'INR',
  merchant: 'SWIGGY',
  accountLast4: '1234',
  occurredAt: '2026-09-13T09:58:00.000Z',
  receivedAt: '2026-09-13T09:58:30.000Z',
  source: 'sms',
  templateId: 'hdfc_card_spent',
  confidence: 0.95,
  suggestedCategoryId: null,
  suggestionConfidence: null,
  suggestionModelVersion: null,
  expenseId: null,
  displayHint: 'HDFC ••1234 · SWIGGY',
  createdAt: NOW,
  updatedAt: NOW,
};
const validDoc = (overrides: Record<string, unknown> = {}) => ({ ...pendingExpenseToDoc(pending), ...overrides });

const approvedExpense = newPersonalExpense({
  id: ID,
  uid: ALICE,
  total: money(45_000, 'INR'),
  categoryId: 'cat-food',
  description: 'SWIGGY',
  note: null,
  occurredAt: pending.occurredAt,
  now: NOW,
  source: 'sms',
  pendingId: ID,
});

async function seed(data: Record<string, unknown> = validDoc()): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p.pendingExpense(ALICE, ID)), data);
  });
}

/** Approve the way P4 does: the expense and the pending update in one batch. */
function approveBatch(uid: string, pendingUpdate: Record<string, unknown>, withExpense = true) {
  const db = as(uid);
  const batch = writeBatch(db);
  if (withExpense) batch.set(doc(db, p.expense(ALICE, ID)), expenseToDoc(approvedExpense));
  batch.update(doc(db, p.pendingExpense(ALICE, ID)), pendingUpdate);
  return batch.commit();
}

before(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-loop-pending',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env.cleanup();
});

describe('pendingExpenses — create', () => {
  it("accepts the converter's document from its owner", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), validDoc()));
  });

  it('refuses a document carrying the raw message body (positive control)', async () => {
    await assertFails(setDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), validDoc({ body: 'Rs.450 spent on card x1234' })));
  });

  it('refuses a document missing a field', async () => {
    const { displayHint: _omitted, ...partial } = validDoc();
    await assertFails(setDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), partial));
  });

  it('refuses a create with expenseId already set', async () => {
    await assertFails(setDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), validDoc({ expenseId: 'exp-1' })));
  });

  it('refuses a create in any status but pending', async () => {
    for (const status of ['approved', 'rejected', 'expired', 'maybe']) {
      await assertFails(setDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), validDoc({ status })));
    }
  });

  it('refuses a float, zero or negative amount, and an unknown source', async () => {
    for (const bad of [{ amountMinor: 450.5 }, { amountMinor: 0 }, { amountMinor: -100 }, { source: 'email' }]) {
      await assertFails(setDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), validDoc(bad)));
    }
  });
});

describe('pendingExpenses — access', () => {
  it('lets no other user read or write', async () => {
    await seed();
    await assertFails(getDoc(doc(as(BOB), p.pendingExpense(ALICE, ID))));
    await assertFails(setDoc(doc(as(BOB), p.pendingExpense(ALICE, 'p2')), validDoc()));
    await assertFails(updateDoc(doc(as(BOB), p.pendingExpense(ALICE, ID)), { status: 'rejected', updatedAt: NOW }));
    await assertSucceeds(getDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID))));
  });

  it('refuses delete, even by the owner', async () => {
    await seed();
    await assertFails(deleteDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID))));
  });
});

describe('pendingExpenses — decisions', () => {
  it('allows pending -> approved together with the linked expense (the P4 batch)', async () => {
    await seed();
    await assertSucceeds(approveBatch(ALICE, { status: 'approved', expenseId: ID, updatedAt: NOW }));
  });

  it('refuses approval without the expense being created in the same batch', async () => {
    await seed();
    await assertFails(approveBatch(ALICE, { status: 'approved', expenseId: ID, updatedAt: NOW }, false));
  });

  it('refuses approval without a string expenseId', async () => {
    await seed();
    await assertFails(approveBatch(ALICE, { status: 'approved', updatedAt: NOW }));
  });

  it('allows pending -> rejected (dismiss)', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), { status: 'rejected', updatedAt: NOW }));
  });

  it('refuses approved -> pending', async () => {
    await seed(validDoc({ status: 'approved', expenseId: ID }));
    await assertFails(updateDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), { status: 'pending', updatedAt: NOW }));
  });

  it('refuses reopening or re-deciding a rejected or expired item', async () => {
    for (const status of ['rejected', 'expired']) {
      await seed(validDoc({ status }));
      await assertFails(updateDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), { status: 'pending', updatedAt: NOW }));
      await assertFails(approveBatch(ALICE, { status: 'approved', expenseId: ID, updatedAt: NOW }));
    }
  });

  it('refuses changing amountMinor, currency or dates on update', async () => {
    await seed();
    const ref = doc(as(ALICE), p.pendingExpense(ALICE, ID));
    await assertFails(updateDoc(ref, { amountMinor: 1, status: 'rejected', updatedAt: NOW }));
    await assertFails(updateDoc(ref, { currency: 'USD', status: 'rejected', updatedAt: NOW }));
    await assertFails(updateDoc(ref, { occurredAt: NOW, status: 'rejected', updatedAt: NOW }));
    await assertFails(approveBatch(ALICE, { status: 'approved', expenseId: ID, amountMinor: 1, updatedAt: NOW }));
  });

  it('refuses an edit that changes nothing but data while staying pending', async () => {
    await seed();
    await assertFails(updateDoc(doc(as(ALICE), p.pendingExpense(ALICE, ID)), { merchant: 'OTHER', updatedAt: NOW }));
  });
});
