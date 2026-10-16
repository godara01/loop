/**
 * scripts/migrate-v2.ts (docs/27 § Migration script), through the exact code
 * it runs (functions/src/migrate.ts), on a seeded emulator: two runs give
 * identical documents, and the rollups equal a rebuild from the expenses.
 *
 * `migrateAllUsers` walks every user, and test files run in parallel against
 * one emulator, so this file uses its own project id (its own database).
 */

import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import * as admin from 'firebase-admin';

import {
  type Category,
  type Expense,
  ESSENTIAL_CATEGORIES,
  INCOME_ESSENTIALS,
  buildRollups,
  categoryFromTemplate,
  categoryToDoc,
  expenseToDoc,
  firestorePaths,
  money,
  newPersonalExpense,
  newProfile,
  parseExpense,
  profileToDoc,
} from '../../packages/shared/src';
import { migrateAllUsers } from '../../functions/src/migrate';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

const PROJECT = 'demo-loop-migrate';
const NOW = '2026-10-16T10:00:00.000Z';
const LATER = '2026-10-17T10:00:00.000Z';
let db: admin.firestore.Firestore;

function tx(uid: string, id: string, localDate: string, minor: number, extra: Partial<Expense> = {}): Expense {
  const base = newPersonalExpense({
    id,
    uid,
    total: money(minor, 'INR'),
    categoryId: 'cat-food',
    description: 'Seeded',
    note: null,
    occurredAt: `${localDate}T06:00:00.000Z`,
    now: NOW,
  });
  return { ...base, localDate, createdLocalDate: localDate, ...extra };
}

/** A v1 user: v1 profile, essential categories (one slug collides with an income essential), mixed transactions. */
function seedUser(uid: string, index: number): { expenses: Expense[]; categories: Category[] } {
  const categories = ESSENTIAL_CATEGORIES.map((template, sortOrder) =>
    categoryFromTemplate(template, { id: `cat-${template.slug.toLowerCase()}`, kind: 'essential', sortOrder, createdAt: NOW }),
  );
  // An expense category already using the first income slug forces the `_IN` path.
  const collidingSlug = INCOME_ESSENTIALS[0]!.slug.toUpperCase();
  categories.push(
    categoryFromTemplate(ESSENTIAL_CATEGORIES[0]!, { id: 'cat-custom-collide', slug: collidingSlug, kind: 'custom', sortOrder: 99, createdAt: NOW }),
  );

  const expenses: Expense[] = [
    tx(uid, 'e1', '2026-09-02', 25_000 + index, { accountId: 'acc-bank' }),
    tx(uid, 'e2', '2026-09-03', 300_000, { categoryId: 'cat-shopping' }),
    tx(uid, 'r1', '2026-10-05', 120_000, { kind: 'refund', refundOf: 'e2', categoryId: 'cat-shopping', accountId: 'acc-bank' }),
    tx(uid, 'i1', '2026-09-01', 5_000_000, { kind: 'income', categoryId: 'cat-salary', accountId: 'acc-bank' }),
    tx(uid, 't1', '2026-09-10', 100_000, { kind: 'transfer', categoryId: 'sys-transfer', accountId: 'acc-bank', toAccountId: 'acc-cash' }),
    tx(uid, 'm1', '2026-09-12', 30_000, { excludeFromSpend: true }),
    tx(uid, 's1', '2026-09-21', 40_000, { lines: [{ categoryId: 'cat-food', amountMinor: 15_000 }, { categoryId: 'cat-home', amountMinor: 25_000 }] }),
    tx(uid, 'd1', '2026-09-20', 10_000, { deletedAt: NOW }),
  ];
  return { expenses, categories };
}

const UIDS = ['user-a', 'user-b', 'user-c', 'user-d', 'user-e'];

async function seed(): Promise<Map<string, Expense[]>> {
  const byUser = new Map<string, Expense[]>();
  for (const [index, uid] of UIDS.entries()) {
    const { expenses, categories } = seedUser(uid, index);
    byUser.set(uid, expenses);
    const batch = db.batch();
    batch.set(db.doc(firestorePaths.user(uid)), profileToDoc(newProfile(uid, true, NOW)));
    for (const category of categories) batch.set(db.doc(firestorePaths.category(uid, category.id)), categoryToDoc(category, NOW));
    for (const expense of expenses) batch.set(db.doc(firestorePaths.expense(uid, expense.id)), expenseToDoc(expense));
    // Stale v1-era rollups and a junk balance the migration must replace.
    batch.set(db.doc(`${firestorePaths.user(uid)}/dailyRollups/2026-09-02`), { totalMinor: 1, count: 9, byCategory: { 'cat-food': 1 } });
    batch.set(db.doc(`${firestorePaths.user(uid)}/dailyRollups/2026-08-01`), { totalMinor: 777, count: 1, byCategory: { 'cat-food': 777 } });
    batch.set(db.doc(firestorePaths.accountBalance(uid, 'acc-gone')), { flowMinor: 4242 });
    await batch.commit();
  }
  return byUser;
}

/** Every document under the user, by path — what "identical results" compares. */
async function dump(uid: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const userRef = db.doc(firestorePaths.user(uid));
  out[userRef.path] = (await userRef.get()).data();
  for (const collection of await userRef.listCollections()) {
    for (const doc of (await collection.get()).docs) out[doc.ref.path] = doc.data();
  }
  return out;
}

async function rollupsOf(uid: string, collection: 'dailyRollups' | 'monthlyRollups'): Promise<Record<string, unknown>> {
  const snapshot = await db.collection(`${firestorePaths.user(uid)}/${collection}`).get();
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.data()]));
}

/** Rollup docs drop zero-valued maps entries differently from buildRollups; compare non-zero content. */
function normalise(rollups: Record<string, unknown>): Record<string, unknown> {
  const clean = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null) return value;
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => [key, clean(inner)] as const)
      .filter(([, inner]) => inner !== 0 && !(typeof inner === 'object' && inner !== null && Object.keys(inner).length === 0));
    return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
  };
  return clean(rollups) as Record<string, unknown>;
}

before(async () => {
  const app = admin.apps.find((candidate) => candidate?.name === 'migrate') ?? admin.initializeApp({ projectId: PROJECT }, 'migrate');
  db = app.firestore();
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

describe('migrate-v2', () => {
  it('runs twice to identical documents, with rollups equal to a rebuild', async () => {
    const byUser = await seed();

    const first = await migrateAllUsers(db, { now: NOW, batchSize: 2 });
    assert.deepEqual(first.users.map((user) => user.uid), UIDS, 'every user, in id order, across pages');
    assert.ok(first.users.every((user) => user.firstMigration));
    const afterFirst = await Promise.all(UIDS.map(dump));

    const second = await migrateAllUsers(db, { now: LATER, batchSize: 2 });
    assert.ok(second.users.every((user) => !user.firstMigration && user.incomeCategoriesSeeded === 0));
    const afterSecond = await Promise.all(UIDS.map(dump));
    assert.deepEqual(afterSecond, afterFirst, 'a second run changes nothing, migratedAt included');

    for (const uid of UIDS) {
      const live = byUser.get(uid)!.map((expense) => parseExpense(uid, expense.id, expenseToDoc(expense)));
      const expected = buildRollups(live);
      assert.deepEqual(normalise(await rollupsOf(uid, 'dailyRollups')), normalise(expected.daily as Record<string, unknown>));
      assert.deepEqual(normalise(await rollupsOf(uid, 'monthlyRollups')), normalise(expected.monthly as Record<string, unknown>));
    }
  });

  it('writes meta/schema, seeds income categories once (with the _IN collision) and fixes account flows', async () => {
    await seed();
    const run = await migrateAllUsers(db, { now: NOW });
    const uid = UIDS[0]!;

    assert.deepEqual((await db.doc(firestorePaths.metaSchema(uid)).get()).data(), { ledger: 2, migratedAt: NOW });
    assert.equal((await db.doc(firestorePaths.user(uid)).get()).data()?.categoriesSeedVersion, 2);

    const seeded = run.users.find((user) => user.uid === uid)!.incomeCategoriesSeeded;
    assert.equal(seeded, INCOME_ESSENTIALS.length);
    const slugs = (await db.collection(firestorePaths.categories(uid)).get()).docs.map((doc) => doc.data().slug as string);
    assert.ok(slugs.includes(`${INCOME_ESSENTIALS[0]!.slug.toUpperCase()}_IN`.slice(0, 12)), 'colliding slug got the _IN suffix');

    // Bank: −25,000 (e1) + 120,000 (r1) + 5,000,000 (i1) − 100,000 (t1). Cash: +100,000. The stale account is zeroed.
    const flow = async (accountId: string) => (await db.doc(firestorePaths.accountBalance(uid, accountId)).get()).data()?.flowMinor;
    assert.equal(await flow('acc-bank'), -25_000 + 120_000 + 5_000_000 - 100_000);
    assert.equal(await flow('acc-cash'), 100_000);
    assert.ok([0, undefined].includes(await flow('acc-gone')));
  });

  it('resumes after --from-uid', async () => {
    await seed();
    const run = await migrateAllUsers(db, { now: NOW, fromUid: 'user-b' });
    assert.deepEqual(run.users.map((user) => user.uid), ['user-c', 'user-d', 'user-e']);
    assert.equal((await db.doc(firestorePaths.metaSchema('user-a')).get()).exists, false);
    assert.equal(run.lastUid, 'user-e');
  });
});
