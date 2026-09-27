import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import * as admin from 'firebase-admin';

import { firestorePaths } from '../../packages/shared/src';
import { cleanupSoftDeletedExpenses, expireStalePendingExpenses } from '../../functions/src/cleanup';
import { handleExpenseWrite } from '../../functions/src/handlers';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

// Own user, and dates in 2025: other test files share this emulator and write
// 2026 data, which these cutoffs can never reach.
const UID = 'user-cleanup';
const NOW = new Date('2025-06-01T03:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

let db: admin.firestore.Firestore;

before(() => {
  const app = admin.apps.length > 0 ? admin.app() : admin.initializeApp({ projectId: 'demo-loop' });
  db = app.firestore();
});

beforeEach(async () => {
  for (const col of ['expenses', 'pendingExpenses', 'dailyRollups', 'monthlyRollups', 'rollupApplied', 'checkIns', 'coinLedger']) {
    const snap = await db.collection(`users/${UID}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

const expense = (deletedAt: string | null, localDate = '2025-01-10') => ({
  amountMinor: 10_000,
  currency: 'INR',
  localDate,
  categoryId: 'cat-food',
  createdAt: '2025-06-01T00:00:00.000Z',
  occurredAt: `${localDate}T10:00:00.000Z`,
  deletedAt,
});

async function ids(collection: string): Promise<string[]> {
  return (await db.collection(`users/${UID}/${collection}`).get()).docs.map((d) => d.id).sort();
}

async function raw(collection: string): Promise<Record<string, unknown>> {
  const snap = await db.collection(`users/${UID}/${collection}`).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, JSON.stringify(d.data())]));
}

describe('cleanupSoftDeleted (C1)', () => {
  it('keeps 89 and exactly 90 days, deletes 91 days, never touches live expenses', async () => {
    const docs = { d89: expense(daysAgo(89)), d90: expense(daysAgo(90)), d91: expense(daysAgo(91)), live: expense(null) };
    for (const [id, data] of Object.entries(docs)) await db.doc(firestorePaths.expense(UID, id)).set(data);

    await cleanupSoftDeletedExpenses(db, NOW);

    assert.deepEqual(await ids('expenses'), ['d89', 'd90', 'live']);
  });

  it('leaves rollup docs byte-identical, including after the delete trigger fires', async () => {
    const live = expense(null);
    const old = expense(null, '2025-01-11');
    for (const [id, data] of [['live', live], ['old', old]] as const) {
      await db.doc(firestorePaths.expense(UID, id)).set(data);
      await handleExpenseWrite(db, UID, id, null, data);
    }
    const softDeleted = { ...old, deletedAt: daysAgo(120) };
    await db.doc(firestorePaths.expense(UID, 'old')).set(softDeleted);
    await handleExpenseWrite(db, UID, 'old', old, softDeleted);
    const beforeRollups = { daily: await raw('dailyRollups'), monthly: await raw('monthlyRollups') };

    await cleanupSoftDeletedExpenses(db, NOW);
    await handleExpenseWrite(db, UID, 'old', softDeleted, null);

    assert.deepEqual(await ids('expenses'), ['live']);
    assert.deepEqual({ daily: await raw('dailyRollups'), monthly: await raw('monthlyRollups') }, beforeRollups);
  });

  it('is a no-op the second time', async () => {
    await db.doc(firestorePaths.expense(UID, 'old')).set(expense(daysAgo(200)));
    await db.doc(firestorePaths.expense(UID, 'recent')).set(expense(daysAgo(10)));
    await cleanupSoftDeletedExpenses(db, NOW);
    const after = await raw('expenses');

    assert.equal(await cleanupSoftDeletedExpenses(db, NOW), 0);
    assert.deepEqual(await raw('expenses'), after);
  });

  it('has its collection-group index declared', () => {
    const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
    const override = indexes.fieldOverrides.find(
      (o: { collectionGroup: string; fieldPath: string }) => o.collectionGroup === 'expenses' && o.fieldPath === 'deletedAt',
    );
    assert.ok(override?.indexes.some((i: { queryScope: string }) => i.queryScope === 'COLLECTION_GROUP'));
  });
});

describe('expirePendingExpenses (C2)', () => {
  const pending = (receivedAt: string, status = 'pending') => ({ status, amountMinor: 45_000, receivedAt, updatedAt: receivedAt });

  it('leaves 29 days untouched and expires 31 days', async () => {
    await db.doc(firestorePaths.pendingExpense(UID, 'p29')).set(pending(daysAgo(29)));
    await db.doc(firestorePaths.pendingExpense(UID, 'p31')).set(pending(daysAgo(31)));

    await expireStalePendingExpenses(db, NOW);

    const docs = await db.collection(firestorePaths.pendingExpenses(UID)).get();
    const status = Object.fromEntries(docs.docs.map((d) => [d.id, d.data().status]));
    assert.deepEqual(status, { p29: 'pending', p31: 'expired' });
  });

  it('never touches approved, rejected or already-expired items', async () => {
    for (const status of ['approved', 'rejected', 'expired']) {
      await db.doc(firestorePaths.pendingExpense(UID, status)).set(pending(daysAgo(60), status));
    }
    const before = await raw('pendingExpenses');
    await expireStalePendingExpenses(db, NOW);
    assert.deepEqual(await raw('pendingExpenses'), before);
  });

  it('is a no-op the second time and never changes the document count', async () => {
    for (let i = 0; i < 5; i += 1) await db.doc(firestorePaths.pendingExpense(UID, `p${i}`)).set(pending(daysAgo(20 + i * 5)));
    const count = (await ids('pendingExpenses')).length;

    const first = await expireStalePendingExpenses(db, NOW);
    const afterFirst = await raw('pendingExpenses');
    const second = await expireStalePendingExpenses(db, NOW);

    assert.ok(first > 0);
    assert.equal(second, 0);
    assert.deepEqual(await raw('pendingExpenses'), afterFirst);
    assert.equal((await ids('pendingExpenses')).length, count);
  });
});
