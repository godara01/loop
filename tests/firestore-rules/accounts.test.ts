/**
 * accounts, accountBalances and rollupApplied rules (docs/18 § Data and rules).
 * Valid documents come from the converter the app uses, so these prove both
 * the refusals and that the app's own writes pass. Its own project id: rules
 * test files run in parallel, and each clears its database between tests.
 */

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

import type { Account } from '../../packages/shared/src/accounts';
import { accountToDoc } from '../../packages/shared/src/firestore/documents';
import { firestorePaths as p } from '../../packages/shared/src/firestore/paths';
import { money } from '../../packages/shared/src/money';

const NOW = '2026-10-16T10:00:00.000Z';
const ALICE = 'alice';
const BOB = 'bob';
const ID = 'acc-hdfc';

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore();

const account: Account = {
  id: ID,
  name: 'HDFC card',
  type: 'card',
  last4: '1234',
  openingBalance: money(-250000, 'INR'),
  openingDate: '2026-10-01',
  colorToken: 'violet',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
};
const validDoc = (overrides: Record<string, unknown> = {}) => ({ ...accountToDoc(account, NOW), ...overrides });

async function seedAsServer(path: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

before(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-loop-accounts',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env.cleanup();
});

describe('accounts — owner CRUD', () => {
  it("creates, reads, updates, archives and deletes the converter's document", async () => {
    const ref = doc(as(ALICE), p.account(ALICE, ID));
    await assertSucceeds(setDoc(ref, validDoc()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { name: 'HDFC Regalia', updatedAt: NOW }));
    await assertSucceeds(updateDoc(ref, { archivedAt: NOW, updatedAt: NOW }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('accepts a cash account with no last4 and a positive opening balance', async () => {
    const ref = doc(as(ALICE), p.account(ALICE, 'acc-cash'));
    await assertSucceeds(setDoc(ref, validDoc({ type: 'cash', last4: null, openingBalance: { amountMinor: 50000, currency: 'INR' } })));
  });

  it("keeps another user out of the owner's accounts", async () => {
    await seedAsServer(p.account(ALICE, ID), validDoc());
    const ref = doc(as(BOB), p.account(ALICE, ID));
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, validDoc()));
    await assertFails(updateDoc(ref, { name: 'Mine now' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('accounts — validation', () => {
  const ref = () => doc(as(ALICE), p.account(ALICE, ID));

  it('denies a bad last4', async () => {
    for (const last4 of ['123', '12345', '12a4', 1234]) {
      await assertFails(setDoc(ref(), validDoc({ last4 })));
    }
  });

  it('denies a bad type', async () => {
    for (const type of ['crypto', 'Card', '', null]) {
      await assertFails(setDoc(ref(), validDoc({ type })));
    }
  });

  it('denies an empty or over-long name', async () => {
    await assertFails(setDoc(ref(), validDoc({ name: '' })));
    await assertFails(setDoc(ref(), validDoc({ name: 'x'.repeat(25) })));
    await assertSucceeds(setDoc(ref(), validDoc({ name: 'x'.repeat(24) })));
  });

  it('denies a float opening balance or a bad opening date', async () => {
    await assertFails(setDoc(ref(), validDoc({ openingBalance: { amountMinor: 1.5, currency: 'INR' } })));
    await assertFails(setDoc(ref(), validDoc({ openingBalance: 1500 })));
    await assertFails(setDoc(ref(), validDoc({ openingDate: '16/10/2026' })));
  });

  it('denies an update that breaks a valid account', async () => {
    await seedAsServer(p.account(ALICE, ID), validDoc());
    await assertFails(updateDoc(ref(), { last4: 'abcd' }));
    await assertFails(updateDoc(ref(), { type: 'loan' }));
  });
});

describe('accountBalances', () => {
  it('is owner-readable', async () => {
    await seedAsServer(p.accountBalance(ALICE, ID), { flowMinor: -1300 });
    await assertSucceeds(getDoc(doc(as(ALICE), p.accountBalance(ALICE, ID))));
    await assertFails(getDoc(doc(as(BOB), p.accountBalance(ALICE, ID))));
  });

  it('denies every client write, including the owner', async () => {
    const ref = doc(as(ALICE), p.accountBalance(ALICE, ID));
    await assertFails(setDoc(ref, { flowMinor: 1_000_000 }));
    await seedAsServer(p.accountBalance(ALICE, ID), { flowMinor: -1300 });
    await assertFails(updateDoc(ref, { flowMinor: 0 }));
    await assertFails(deleteDoc(ref));
  });
});

describe('rollupApplied', () => {
  const marker = { localDate: '2026-10-02', kind: 'expense', contributions: [], flows: [{ accountId: ID, deltaMinor: -1300 }] };

  it('the owner can read the marker; nobody else can', async () => {
    await seedAsServer(p.rollupApplied(ALICE, 'e1'), marker);
    await assertSucceeds(getDoc(doc(as(ALICE), p.rollupApplied(ALICE, 'e1'))));
    await assertFails(getDoc(doc(as(BOB), p.rollupApplied(ALICE, 'e1'))));
  });

  it('denies every client write', async () => {
    const ref = doc(as(ALICE), p.rollupApplied(ALICE, 'e1'));
    await assertFails(setDoc(ref, marker));
    await seedAsServer(p.rollupApplied(ALICE, 'e1'), marker);
    await assertFails(updateDoc(ref, { flows: [] }));
    await assertFails(deleteDoc(ref));
  });
});
