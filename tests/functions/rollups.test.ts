import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import * as admin from 'firebase-admin';

import { type Expense, buildRollups, firestorePaths } from '../../packages/shared/src';
import { handleExpenseWrite } from '../../functions/src/handlers';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

// Its own user: test files run in parallel against one emulator.
const UID = 'user-rollups';
let db: admin.firestore.Firestore;

type ExpenseData = {
  amountMinor: number;
  currency: string;
  localDate: string;
  categoryId: string;
  createdAt: string;
  occurredAt: string;
  deletedAt: string | null;
};

function expense(overrides: Partial<ExpenseData> = {}): ExpenseData {
  const localDate = overrides.localDate ?? '2026-09-10';
  // createdAt a day later than any test date: backdated, so the coin/check-in
  // half of the handler stays out of the way.
  return {
    amountMinor: 10_000,
    currency: 'INR',
    localDate,
    categoryId: 'cat-food',
    createdAt: '2026-12-01T10:00:00.000Z',
    occurredAt: `${localDate}T10:00:00.000Z`,
    deletedAt: null,
    ...overrides,
  };
}

/** Write the expense doc, then deliver the trigger the way Functions would. */
async function write(id: string, before: ExpenseData | null, after: ExpenseData | null): Promise<void> {
  const ref = db.doc(firestorePaths.expense(UID, id));
  if (after) await ref.set(after);
  else await ref.delete();
  await handleExpenseWrite(db, UID, id, before, after);
}

async function readAll(collection: string): Promise<Record<string, unknown>> {
  const snap = await db.collection(`users/${UID}/${collection}`).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
}

async function stored() {
  return { daily: await readAll('dailyRollups'), monthly: await readAll('monthlyRollups') };
}

/** What the rollups must equal: rebuilt from scratch from the live expense docs. */
async function expected() {
  const snap = await db.collection(firestorePaths.expenses(UID)).get();
  const expenses = snap.docs.map(
    (d) =>
      ({
        id: d.id,
        categoryId: d.data().categoryId,
        total: { minor: d.data().amountMinor, currency: d.data().currency },
        localDate: d.data().localDate,
        deletedAt: d.data().deletedAt ?? null,
      }) as Expense,
  );
  return buildRollups(expenses);
}

before(() => {
  const app = admin.apps.length > 0 ? admin.app() : admin.initializeApp({ projectId: 'demo-loop' });
  db = app.firestore();
});

beforeEach(async () => {
  for (const col of ['expenses', 'dailyRollups', 'monthlyRollups', 'rollupApplied', 'checkIns', 'coinLedger']) {
    const snap = await db.collection(`users/${UID}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

describe('onExpenseWrite — rollups', () => {
  it('a new expense lands in its daily and monthly rollup', async () => {
    await write('e1', null, expense());

    const { daily, monthly } = await stored();
    assert.deepEqual(daily, { '2026-09-10': { totalMinor: 10_000, count: 1, byCategory: { 'cat-food': 10_000 } } });
    assert.deepEqual(monthly, {
      '2026-09': { totalMinor: 10_000, count: 1, byCategory: { 'cat-food': 10_000 }, byDay: { '2026-09-10': 10_000 } },
    });
  });

  it('editing the amount replaces the old contribution, it does not add to it', async () => {
    const v1 = expense();
    await write('e1', null, v1);
    await write('e1', v1, expense({ amountMinor: 25_050 }));

    const { daily } = await stored();
    assert.deepEqual(daily['2026-09-10'], { totalMinor: 25_050, count: 1, byCategory: { 'cat-food': 25_050 } });
  });

  it('moving to another category and day moves the money with it', async () => {
    await write('keep', null, expense({ amountMinor: 5_000 }));
    const v1 = expense();
    await write('e1', null, v1);
    await write('e1', v1, expense({ categoryId: 'cat-travel', localDate: '2026-10-01' }));

    const { daily, monthly } = await stored();
    assert.deepEqual(daily['2026-09-10'], { totalMinor: 5_000, count: 1, byCategory: { 'cat-food': 5_000 } });
    assert.deepEqual(daily['2026-10-01'], { totalMinor: 10_000, count: 1, byCategory: { 'cat-travel': 10_000 } });
    assert.deepEqual(monthly['2026-09']?.byDay, { '2026-09-10': 5_000 });
    assert.deepEqual(monthly['2026-10']?.byCategory, { 'cat-travel': 10_000 });
  });

  it('soft delete removes the contribution and deletes rollups that reach zero', async () => {
    const v1 = expense();
    await write('e1', null, v1);
    await write('e1', v1, expense({ deletedAt: '2026-09-11T10:00:00.000Z' }));

    assert.deepEqual(await stored(), { daily: {}, monthly: {} });
    assert.deepEqual(await readAll('rollupApplied'), {}, 'marker cleared once nothing is applied');
  });

  it('a hard delete removes the contribution too', async () => {
    const v1 = expense();
    await write('e1', null, v1);
    await write('e1', v1, null);

    assert.deepEqual(await stored(), { daily: {}, monthly: {} });
  });

  it('the same event delivered twice is applied once', async () => {
    const v1 = expense();
    await write('e1', null, v1);
    await handleExpenseWrite(db, UID, 'e1', null, v1);
    await handleExpenseWrite(db, UID, 'e1', null, v1);

    const { daily } = await stored();
    assert.deepEqual(daily['2026-09-10'], { totalMinor: 10_000, count: 1, byCategory: { 'cat-food': 10_000 } });
  });

  it('an older event arriving after a newer one leaves the rollups matching the current expenses', async () => {
    const v1 = expense();
    const v2 = expense({ amountMinor: 70_000, categoryId: 'cat-rent' });
    await write('e1', null, v1);
    await write('e1', v1, v2);
    // The create event for v1 is redelivered late, after v2 is already stored.
    await handleExpenseWrite(db, UID, 'e1', null, v1);

    const { daily, monthly } = await stored();
    assert.deepEqual({ daily, monthly }, await expected());
    assert.deepEqual(daily['2026-09-10'], { totalMinor: 70_000, count: 1, byCategory: { 'cat-rent': 70_000 } });
  });

  it('a sequence of creates, edits and deletes ends equal to buildRollups of what is left', async () => {
    const a = expense({ amountMinor: 1_111 });
    const b = expense({ amountMinor: 2_222, localDate: '2026-09-30', categoryId: 'cat-travel' });
    const c = expense({ amountMinor: 3_333, localDate: '2026-10-31' });
    await write('a', null, a);
    await write('b', null, b);
    await write('c', null, c);
    await write('a', a, { ...a, localDate: '2026-10-31' });
    await write('b', b, { ...b, deletedAt: '2026-10-02T00:00:00.000Z' });
    await write('c', c, { ...c, categoryId: 'cat-travel' });

    assert.deepEqual(await stored(), await expected());
  });
});
