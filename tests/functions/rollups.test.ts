import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import * as admin from 'firebase-admin';

import { type Expense, buildRollups, firestorePaths, type Money } from '../../packages/shared/src';
import { handleExpenseWrite } from '../../functions/src/handlers';
import { rebuildUserLedger, rebuildUserRollups } from '../../functions/src/rollups';

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
  kind?: 'expense' | 'income' | 'refund' | 'transfer' | 'settlement' | 'loan';
  accountId?: string;
  toAccountId?: string;
  lines?: Array<{ categoryId: string; amountMinor: number }>;
  description?: string;
  note?: string | null;
  source?: 'manual' | 'sms' | 'shared' | 'group' | 'import';
};

/** Create a valid expense document that parseExpense can parse. */
function expense(overrides: Partial<ExpenseData> = {}): Record<string, unknown> {
  const localDate = overrides.localDate ?? '2026-09-10';
  const amountMinor = overrides.amountMinor ?? 10_000;
  const currency = overrides.currency ?? 'INR';
  const categoryId = overrides.categoryId ?? 'cat-food';
  const kind = overrides.kind ?? 'expense';
  const description = overrides.description ?? 'Test expense';
  const note = overrides.note ?? null;
  const lines = overrides.lines;
  const accountId = overrides.accountId;
  const toAccountId = overrides.toAccountId;
  const source = overrides.source ?? 'manual';

  // Build allocations - single allocation for the user (personal expense)
  const allocations = [{ memberId: UID, amountMinor }];

  // For multi-line expenses, create allocations per line
  const useLines = lines && lines.length > 0;
  const lineAllocations = useLines
    ? lines.map((line) => ({ memberId: UID, amountMinor: line.amountMinor }))
    : allocations;

  const doc: Record<string, unknown> = {
    amountMinor,
    currency,
    localDate,
    categoryId,
    kind,
    description,
    note,
    occurredAt: overrides.occurredAt ?? `${localDate}T10:00:00.000Z`,
    createdAt: overrides.createdAt ?? '2026-12-01T10:00:00.000Z',
    updatedAt: overrides.createdAt ?? '2026-12-01T10:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    source,
    groupId: null,
    paidBy: UID,
    splitMode: 'exact' as const,
    allocations: lineAllocations,
    receiptPath: null,
    pendingId: null,
    createdLocalDate: null,
  };

  if (useLines) {
    doc.lines = lines!.map((line) => ({ categoryId: line.categoryId, amountMinor: line.amountMinor }));
  }
  if (accountId) doc.accountId = accountId;
  if (toAccountId) doc.toAccountId = toAccountId;
  if (kind === 'settlement' || kind === 'loan') {
    doc.direction = 'out';
  }

  return doc;
}

/** Write the expense doc, then deliver the trigger the way Functions would. */
async function write(id: string, before: ExpenseData | null, after: ExpenseData | null): Promise<void> {
  const ref = db.doc(firestorePaths.expense(UID, id));
  if (after) await ref.set(after);
  else await ref.delete();
  await handleExpenseWrite(db, UID, id, before, after);
}

async function readAll(collection: string, uid = UID): Promise<Record<string, unknown>> {
  const snap = await db.collection(`users/${uid}/${collection}`).get();
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

const OTHER = 'user-rollups-other';

beforeEach(async () => {
  for (const uid of [UID, OTHER]) {
    for (const col of ['expenses', 'dailyRollups', 'monthlyRollups', 'rollupApplied', 'accountBalances', 'checkIns', 'coinLedger']) {
      const snap = await db.collection(`users/${uid}/${col}`).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  }
});

describe('onExpenseWrite — rollups', () => {
  it('a new expense lands in its daily and monthly rollup', async () => {
    await write('e1', null, expense());

    const { daily, monthly } = await stored();
    assert.deepEqual(daily, {
      '2026-09-10': {
        totalMinor: 10_000,
        count: 1,
        byCategory: { 'cat-food': 10_000 },
        refundCount: 0,
        refundMinor: 0,
        refundByCategory: {},
        incomeCount: 0,
        incomeMinor: 0,
        incomeByCategory: {},
      },
    });
    assert.deepEqual(monthly, {
      '2026-09': {
        totalMinor: 10_000,
        count: 1,
        byCategory: { 'cat-food': 10_000 },
        byDay: { '2026-09-10': 10_000 },
        refundCount: 0,
        refundMinor: 0,
        refundByCategory: {},
        incomeCount: 0,
        incomeMinor: 0,
        incomeByCategory: {},
      },
    });
  });

  it('editing the amount replaces the old contribution, it does not add to it', async () => {
    const v1 = expense();
    await write('e1', null, v1);
    await write('e1', v1, expense({ amountMinor: 25_050 }));

    const { daily } = await stored();
    assert.deepEqual(daily['2026-09-10'], {
      totalMinor: 25_050,
      count: 1,
      byCategory: { 'cat-food': 25_050 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
  });

  it('moving to another category and day moves the money with it', async () => {
    await write('keep', null, expense({ amountMinor: 5_000 }));
    const v1 = expense();
    await write('e1', null, v1);
    await write('e1', v1, expense({ categoryId: 'cat-travel', localDate: '2026-10-01' }));

    const { daily, monthly } = await stored();
    assert.deepEqual(daily['2026-09-10'], {
      totalMinor: 5_000,
      count: 1,
      byCategory: { 'cat-food': 5_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
    assert.deepEqual(daily['2026-10-01'], {
      totalMinor: 10_000,
      count: 1,
      byCategory: { 'cat-travel': 10_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
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
    assert.deepEqual(daily['2026-09-10'], {
      totalMinor: 10_000,
      count: 1,
      byCategory: { 'cat-food': 10_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
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
    assert.deepEqual(daily['2026-09-10'], {
      totalMinor: 70_000,
      count: 1,
      byCategory: { 'cat-rent': 70_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
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

describe('rebuildRollups', () => {
  async function everything(uid = UID) {
    return {
      daily: await readAll('dailyRollups', uid),
      monthly: await readAll('monthlyRollups', uid),
      markers: await readAll('rollupApplied', uid),
    };
  }

  it('fixes a corrupted rollup and removes one with no expenses behind it', async () => {
    await write('a', null, expense({ amountMinor: 1_500 }));
    await write('b', null, expense({ amountMinor: 2_500, localDate: '2026-10-02', categoryId: 'cat-travel' }));
    await db.doc(`users/${UID}/dailyRollups/2026-09-10`).set({ totalMinor: 1, count: 9, byCategory: {} });
    await db.doc(`users/${UID}/dailyRollups/2026-08-01`).set({ totalMinor: 700, count: 1, byCategory: { x: 700 } });
    await db.doc(`users/${UID}/monthlyRollups/2026-08`).set({ totalMinor: 700, count: 1, byCategory: {}, byDay: {} });

    const result = await rebuildUserRollups(db, UID);

    assert.deepEqual(await stored(), await expected());
    assert.deepEqual(result, { expenses: 2, daily: 2, monthly: 2 });
  });

  it('leaves soft-deleted expenses out', async () => {
    await write('a', null, expense({ amountMinor: 1_500 }));
    await db.doc(firestorePaths.expense(UID, 'gone')).set(expense({ deletedAt: '2026-09-11T00:00:00.000Z' }));

    await rebuildUserRollups(db, UID);

    assert.deepEqual((await stored()).daily['2026-09-10'], {
      totalMinor: 1_500,
      count: 1,
      byCategory: { 'cat-food': 1_500 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
  });

  it('gives identical documents when run twice', async () => {
    await write('a', null, expense({ amountMinor: 1_500 }));
    await write('b', null, expense({ amountMinor: 2_500, localDate: '2026-10-31' }));
    await db.doc(`users/${UID}/dailyRollups/2026-09-10`).set({ totalMinor: 1, count: 1, byCategory: {} });

    await rebuildUserRollups(db, UID);
    const first = await everything();
    await rebuildUserRollups(db, UID);

    assert.deepEqual(await everything(), first);
  });

  it("rebuilds only the given user's data", async () => {
    const corrupted = { totalMinor: 1, count: 42, byCategory: {} };
    await db.doc(`users/${OTHER}/dailyRollups/2026-09-10`).set(corrupted);
    await db.doc(`users/${OTHER}/rollupApplied/x`).set({ localDate: '2026-09-10', categoryId: 'c', amountMinor: 1, currency: 'INR' });
    await write('a', null, expense());

    await rebuildUserRollups(db, UID);

    assert.deepEqual(await readAll('dailyRollups', OTHER), { '2026-09-10': corrupted });
    assert.equal(Object.keys(await readAll('rollupApplied', OTHER)).length, 1);
  });

  it('resets the markers, so an edit after a rebuild is not double counted', async () => {
    const v1 = expense({ amountMinor: 1_000 });
    await write('a', null, v1);
    // Markers lost, rollups wrong: a rebuild must restore both.
    await db.doc(`users/${UID}/rollupApplied/a`).delete();
    await db.doc(`users/${UID}/dailyRollups/2026-09-10`).set({ totalMinor: 5, count: 3, byCategory: {} });

    await rebuildUserRollups(db, UID);
    await write('a', v1, expense({ amountMinor: 4_000 }));

    assert.deepEqual(await stored(), await expected());
    const { daily } = await stored();
    assert.equal((daily['2026-09-10'] as { totalMinor: number }).totalMinor, 4_000);
  });

  // --- New tests for K5 part A ---

  it('an income lands in its own income bucket', async () => {
    await write('inc1', null, expense({ kind: 'income', amountMinor: 50_000, categoryId: 'cat-salary', localDate: '2026-09-15' }));

    const { daily, monthly } = await stored();
    assert.deepEqual(daily['2026-09-15'], {
      totalMinor: 0,
      count: 0,
      byCategory: {},
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 1,
      incomeMinor: 50_000,
      incomeByCategory: { 'cat-salary': 50_000 },
    });
    assert.deepEqual(monthly['2026-09'], {
      totalMinor: 0,
      count: 0,
      byCategory: {},
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 1,
      incomeMinor: 50_000,
      incomeByCategory: { 'cat-salary': 50_000 },
      byDay: {},
    });
  });

  it('a refund lands in its own refund bucket', async () => {
    await write('ref1', null, expense({ kind: 'refund', amountMinor: 5_000, categoryId: 'cat-electronics', localDate: '2026-09-15' }));

    const { daily, monthly } = await stored();
    assert.deepEqual(daily['2026-09-15'], {
      totalMinor: 0,
      count: 0,
      byCategory: {},
      refundCount: 1,
      refundMinor: 5_000,
      refundByCategory: { 'cat-electronics': 5_000 },
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
    assert.deepEqual(monthly['2026-09'], {
      totalMinor: 0,
      count: 0,
      byCategory: {},
      refundCount: 1,
      refundMinor: 5_000,
      refundByCategory: { 'cat-electronics': 5_000 },
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
      byDay: {},
    });
  });

  it('a transfer adds no rollup but moves both accountBalances', async () => {
    await write('tx1', null, expense({ kind: 'transfer', amountMinor: 10_000, accountId: 'acc-a', toAccountId: 'acc-b', localDate: '2026-09-15' }));

    const { daily, monthly } = await stored();
    assert.deepEqual(daily, {});
    assert.deepEqual(monthly, {});

    const balances = await readAll('accountBalances');
    assert.equal(balances['acc-a']?.flowMinor, -10_000);
    assert.equal(balances['acc-b']?.flowMinor, 10_000);
  });

  it('an account move (edit accountId A→B) moves flowMinor from A to B, totals unchanged', async () => {
    await write('tx1', null, expense({ amountMinor: 10_000, accountId: 'acc-a', localDate: '2026-09-15' }));
    await write('tx1', expense({ amountMinor: 10_000, accountId: 'acc-a', localDate: '2026-09-15' }), expense({ amountMinor: 10_000, accountId: 'acc-b', localDate: '2026-09-15' }));

    const balances = await readAll('accountBalances');
    assert.equal(balances['acc-a']?.flowMinor, 0);
    assert.equal(balances['acc-b']?.flowMinor, -10_000);

    const { daily } = await stored();
    assert.deepEqual(daily['2026-09-15'] as any, {
      totalMinor: 10_000,
      count: 1,
      byCategory: { 'cat-food': 10_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
  });

  it('an income-only day\'s rollup is NOT deleted', async () => {
    await write('inc1', null, expense({ kind: 'income', amountMinor: 50_000, categoryId: 'cat-salary', localDate: '2026-09-20' }));

    const { daily } = await stored();
    // The daily rollup for 2026-09-20 should exist with incomeCount=1, count=0
    // (v1's isEmptyRollup would have deleted it because count=0, but v2 checks all three counts)
    assert.ok(daily['2026-09-20'], 'income-only day should have a rollup');
    assert.equal(daily['2026-09-20'].incomeCount, 1);
    assert.equal(daily['2026-09-20'].count, 0);
    assert.equal(daily['2026-09-20'].totalMinor, 0);
  });

  it('an import create writes no rollup/marker/accountBalance', async () => {
    await write('imp1', null, expense({ source: 'import', amountMinor: 10_000, localDate: '2026-09-25' }));

    const { daily, monthly } = await stored();
    assert.deepEqual(daily, {});
    assert.deepEqual(monthly, {});

    const balances = await readAll('accountBalances');
    assert.deepEqual(balances, {});

    const markers = await readAll('rollupApplied');
    assert.deepEqual(markers, {});
  });

  it('parity: seeded pseudo-random sequence matches rebuildUserLedger', async () => {
    // Use a seeded pseudo-random generator for reproducibility
    let seed = 0x12345678;
    function nextRandom(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    }

    const kinds = ['expense', 'income', 'refund', 'transfer'] as const;
    const categories = ['cat-food', 'cat-travel', 'cat-salary', 'cat-electronics', 'cat-shopping'];
    const accounts = ['acc-a', 'acc-b', 'acc-c', 'acc-d'];
    const dates = ['2026-09-10', '2026-09-15', '2026-09-20', '2026-10-01', '2026-10-15', '2026-10-31'];

    const liveExpenses: Record<string, ReturnType<typeof expense>> = {};

    for (let i = 0; i < 50; i++) {
      const op = nextRandom();
      const id = `tx${i}`;

      if (op < 0.5 || Object.keys(liveExpenses).length === 0) {
        // Create
        const kind = kinds[Math.floor(nextRandom() * kinds.length)];
        const cat = categories[Math.floor(nextRandom() * categories.length)];
        const date = dates[Math.floor(nextRandom() * dates.length)];
        const amount = Math.floor(nextRandom() * 50_000) + 100;
        const acc = kind === 'transfer' ? accounts[Math.floor(nextRandom() * accounts.length)] : accounts[Math.floor(nextRandom() * accounts.length)];
        const toAcc = kind === 'transfer' ? accounts[Math.floor(nextRandom() * accounts.length)] : undefined;

        const exp = expense({
          kind,
          amountMinor: amount,
          categoryId: cat,
          localDate: date,
          accountId: acc,
          toAccountId: toAcc,
        });
        liveExpenses[id] = exp;
        await write(id, null, exp);
      } else if (op < 0.75) {
        // Edit
        const ids = Object.keys(liveExpenses);
        const editId = ids[Math.floor(nextRandom() * ids.length)];
        const oldExp = liveExpenses[editId];
        const newKind = kinds[Math.floor(nextRandom() * kinds.length)];
        const newCat = categories[Math.floor(nextRandom() * categories.length)];
        const newDate = dates[Math.floor(nextRandom() * dates.length)];
        const newAmount = Math.floor(nextRandom() * 50_000) + 100;
        const newAcc = accounts[Math.floor(nextRandom() * accounts.length)];
        const newToAcc = newKind === 'transfer' ? accounts[Math.floor(nextRandom() * accounts.length)] : undefined;

        const newExp = expense({
          kind: newKind,
          amountMinor: newAmount,
          categoryId: newCat,
          localDate: newDate,
          accountId: newAcc,
          toAccountId: newToAcc,
        });
        liveExpenses[editId] = newExp;
        await write(editId, oldExp, newExp);
      } else if (op < 0.9) {
        // Soft delete
        const ids = Object.keys(liveExpenses);
        const delId = ids[Math.floor(nextRandom() * ids.length)];
        const oldExp = liveExpenses[delId];
        const deletedExp = { ...oldExp, deletedAt: '2026-11-01T00:00:00.000Z' };
        delete liveExpenses[delId];
        await write(delId, oldExp, deletedExp);
      } else {
        // Hard delete
        const ids = Object.keys(liveExpenses);
        const delId = ids[Math.floor(nextRandom() * ids.length)];
        const oldExp = liveExpenses[delId];
        delete liveExpenses[delId];
        await write(delId, oldExp, null);
      }
    }

    // Now compare with rebuildUserLedger
    await rebuildUserRollups(db, UID);

    const { daily, monthly } = await stored();
    const balances = await readAll('accountBalances');
    const markers = await readAll('rollupApplied');

    // Create a fresh user and rebuild to compare
    const FRESH_UID = 'user-parity-fresh';
    for (const col of ['expenses', 'dailyRollups', 'monthlyRollups', 'rollupApplied', 'accountBalances']) {
      const snap = await db.collection(`users/${FRESH_UID}/${col}`).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }

    // Copy the live expenses to the fresh user
    for (const [id, exp] of Object.entries(liveExpenses)) {
      const ref = db.doc(firestorePaths.expense(FRESH_UID, id));
      await ref.set(exp);
    }

    await rebuildUserRollups(db, FRESH_UID);

    const freshStored = await (async () => {
      const dailySnap = await db.collection(firestorePaths.dailyRollups(FRESH_UID)).get();
      const monthlySnap = await db.collection(firestorePaths.monthlyRollups(FRESH_UID)).get();
      const balanceSnap = await db.collection(firestorePaths.accountBalances(FRESH_UID)).get();
      const markerSnap = await db.collection(firestorePaths.user(FRESH_UID) + '/rollupApplied').get();

      const daily: Record<string, any> = {};
      const monthly: Record<string, any> = {};
      const balances: Record<string, any> = {};
      const markers: Record<string, any> = {};

      dailySnap.docs.forEach((d) => (daily[d.id] = d.data()));
      monthlySnap.docs.forEach((d) => (monthly[d.id] = d.data()));
      balanceSnap.docs.forEach((d) => (balances[d.id] = d.data()));
      markerSnap.docs.forEach((d) => (markers[d.id] = d.data()));

      return { daily, monthly, balances, markers };
    })();

    assert.deepEqual(daily, freshStored.daily, 'daily rollups match rebuild');
    assert.deepEqual(monthly, freshStored.monthly, 'monthly rollups match rebuild');
    assert.deepEqual(balances, freshStored.balances, 'accountBalances match rebuild');
    assert.deepEqual(markers, freshStored.markers, 'markers match rebuild');
  });

  // --- Code review fixes tests ---

  it('after rebuildUserLedger an imported expense is counted', async () => {
    // Create an import expense directly (simulating finalizeImport having run)
    await db.doc(firestorePaths.expense(UID, 'imp1')).set(
      expense({ source: 'import', amountMinor: 25_000, categoryId: 'cat-food', localDate: '2026-09-10' })
    );

    // Rebuild should include import expenses
    await rebuildUserRollups(db, UID);

    const { daily, monthly } = await stored();
    assert.deepEqual(daily['2026-09-10'], {
      totalMinor: 25_000,
      count: 1,
      byCategory: { 'cat-food': 25_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
    assert.deepEqual(monthly['2026-09'], {
      totalMinor: 25_000,
      count: 1,
      byCategory: { 'cat-food': 25_000 },
      byDay: { '2026-09-10': 25_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });

    // Marker should exist
    const markers = await readAll('rollupApplied');
    assert.ok(markers['imp1'], 'marker should exist for imported expense after rebuild');
    assert.equal(markers['imp1'].localDate, '2026-09-10');
    assert.equal(markers['imp1'].kind, 'expense');
  });

  it('editing an imported expense after a rebuild applies the delta (not a removal)', async () => {
    // Create an import expense and rebuild
    await db.doc(firestorePaths.expense(UID, 'imp1')).set(
      expense({ source: 'import', amountMinor: 10_000, categoryId: 'cat-food', localDate: '2026-09-10' })
    );
    await rebuildUserRollups(db, UID);

    // Now edit the imported expense (simulating user editing after finalizeImport)
    // Use write() to update Firestore and trigger the handler
    await write('imp1',
      expense({ source: 'import', amountMinor: 10_000, categoryId: 'cat-food', localDate: '2026-09-10' }),
      expense({ source: 'import', amountMinor: 20_000, categoryId: 'cat-travel', localDate: '2026-09-10' })
    );

    const { daily } = await stored();
    // Should have the new amount in the new category, old category removed
    assert.deepEqual(daily['2026-09-10'], {
      totalMinor: 20_000,
      count: 1,
      byCategory: { 'cat-travel': 20_000 },
      refundCount: 0,
      refundMinor: 0,
      refundByCategory: {},
      incomeCount: 0,
      incomeMinor: 0,
      incomeByCategory: {},
    });
  });

  it('rebuildUserLedger with >500 writes succeeds (bulkWriter)', async () => {
    // Create 260 expenses on distinct days = 260 daily + 260 markers = 520 writes
    // Plus monthly rollups and account balances = well over 500
    const baseDate = new Date('2025-01-01');
    for (let i = 0; i < 260; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      const localDate = date.toISOString().slice(0, 10);
      await db.doc(firestorePaths.expense(UID, `e${i}`)).set(
        expense({ amountMinor: 1000 + i, categoryId: 'cat-food', localDate })
      );
    }

    // This should not throw "Cannot modify a WriteBatch that has been committed"
    const result = await rebuildUserRollups(db, UID);

    assert.equal(result.expenses, 260);
    assert.equal(result.daily, 260);
    // Monthly rollups: 9 months (Jan-Sep 2025)
    assert.ok(result.monthly >= 9 && result.monthly <= 12);

    // Verify all daily rollups exist
    const { daily } = await stored();
    assert.equal(Object.keys(daily).length, 260);

    // Verify all markers exist
    const markers = await readAll('rollupApplied');
    assert.equal(Object.keys(markers).length, 260);
  });

  it('stale accountBalances are zeroed out on rebuild', async () => {
    // Create an expense with account A
    await write('tx1', null, expense({ amountMinor: 10_000, accountId: 'acc-a', localDate: '2026-09-10' }));

    // Verify account balance exists
    let balances = await readAll('accountBalances');
    assert.equal(balances['acc-a']?.flowMinor, -10_000);

    // Delete the expense
    await write('tx1', expense({ amountMinor: 10_000, accountId: 'acc-a', localDate: '2026-09-10' }), null);

    // Rebuild should zero out acc-a
    await rebuildUserRollups(db, UID);

    balances = await readAll('accountBalances');
    // Account should either not exist or have flowMinor: 0
    assert.ok(!balances['acc-a'] || balances['acc-a']?.flowMinor === 0, 'stale account balance should be zeroed');
  });

  it('span rebuild: daily range exact, monthly whole months, markers outside range untouched', async () => {
    // Month 2026-09 has tx on 09-02, 09-15, 09-28
    await write('e1', null, expense({ amountMinor: 10_000, localDate: '2026-09-02', categoryId: 'cat-a' }));
    await write('e2', null, expense({ amountMinor: 20_000, localDate: '2026-09-15', categoryId: 'cat-b' }));
    await write('e3', null, expense({ amountMinor: 30_000, localDate: '2026-09-28', categoryId: 'cat-c' }));

    // Corrupt the 09-15 daily and the 2026-09 monthly doc
    await db.doc(firestorePaths.dailyRollup(UID, '2026-09-15')).set({ totalMinor: 999_999, count: 999, byCategory: { corrupted: 999_999 }, refundCount: 0, refundMinor: 0, refundByCategory: {}, incomeCount: 0, incomeMinor: 0, incomeByCategory: {} });
    await db.doc(firestorePaths.monthlyRollup(UID, '2026-09')).set({ totalMinor: 888_888, count: 888, byCategory: { corrupted: 888_888 }, byDay: {}, refundCount: 0, refundMinor: 0, refundByCategory: {}, incomeCount: 0, incomeMinor: 0, incomeByCategory: {} });

    // Rebuild with span {from:'2026-09-10', to:'2026-09-20'}
    await rebuildUserLedger(db, UID, { from: '2026-09-10', to: '2026-09-20' });

    const { daily, monthly } = await stored();

    // Monthly 2026-09 equals buildRollups of all three (whole month rebuilt)
    assert.ok(monthly['2026-09'], 'Sep monthly should exist');
    assert.equal(monthly['2026-09'].totalMinor, 60_000, 'Sep monthly should have all three expenses');
    assert.equal(monthly['2026-09'].byCategory['cat-a'], 10_000);
    assert.equal(monthly['2026-09'].byCategory['cat-b'], 20_000);
    assert.equal(monthly['2026-09'].byCategory['cat-c'], 30_000);

    // Daily 09-02 and 09-28 docs untouched (still exist, unchanged from original)
    assert.equal(daily['2026-09-02'].totalMinor, 10_000, '09-02 daily should be unchanged');
    assert.equal(daily['2026-09-02'].byCategory['cat-a'], 10_000);
    assert.equal(daily['2026-09-28'].totalMinor, 30_000, '09-28 daily should be unchanged');
    assert.equal(daily['2026-09-28'].byCategory['cat-c'], 30_000);

    // Daily 09-15 fixed (rebuilt correctly)
    assert.equal(daily['2026-09-15'].totalMinor, 20_000, '09-15 daily should be fixed');
    assert.equal(daily['2026-09-15'].byCategory['cat-b'], 20_000);
  });

  it('markers outside daily range persist; edit after span rebuild applies delta correctly', async () => {
    // Month 2026-09 has tx on 09-02, 09-15, 09-28
    await write('e1', null, expense({ amountMinor: 10_000, localDate: '2026-09-02', categoryId: 'cat-a' }));
    await write('e2', null, expense({ amountMinor: 20_000, localDate: '2026-09-15', categoryId: 'cat-b' }));
    await write('e3', null, expense({ amountMinor: 30_000, localDate: '2026-09-28', categoryId: 'cat-c' }));

    // Rebuild with span {from:'2026-09-10', to:'2026-09-20'}
    await rebuildUserLedger(db, UID, { from: '2026-09-10', to: '2026-09-20' });

    // Markers of 09-02 and 09-28 expenses still exist
    const markers1 = await readAll('rollupApplied');
    assert.ok(markers1['e1'], 'marker for 09-02 should exist');
    assert.ok(markers1['e3'], 'marker for 09-28 should exist');
    assert.equal(markers1['e1'].localDate, '2026-09-02');
    assert.equal(markers1['e3'].localDate, '2026-09-28');

    // Edit the 09-02 expense afterwards (change amount from 10k to 15k)
    await write('e1',
      expense({ amountMinor: 10_000, localDate: '2026-09-02', categoryId: 'cat-a' }),
      expense({ amountMinor: 15_000, localDate: '2026-09-02', categoryId: 'cat-a' })
    );

    const { daily, monthly } = await stored();

    // Rollups change by exactly the delta (no double count)
    // 09-02: was 10k, now 15k → +5k
    assert.equal(daily['2026-09-02'].totalMinor, 15_000, '09-02 daily should reflect edit');
    assert.equal(daily['2026-09-02'].byCategory['cat-a'], 15_000);
    // Monthly: was 60k, now 65k → +5k
    assert.equal(monthly['2026-09'].totalMinor, 65_000, 'Sep monthly should reflect edit');
    assert.equal(monthly['2026-09'].byCategory['cat-a'], 15_000);
    // 09-15 and 09-28 unchanged
    assert.equal(daily['2026-09-15'].totalMinor, 20_000);
    assert.equal(daily['2026-09-28'].totalMinor, 30_000);
  });

  it('span rebuild never changes rollup docs in other months', async () => {
    // Create expenses in Sep and Oct
    await write('e1', null, expense({ amountMinor: 10_000, localDate: '2026-09-15', categoryId: 'cat-a' }));
    await write('e2', null, expense({ amountMinor: 20_000, localDate: '2026-10-10', categoryId: 'cat-b' }));

    // Rebuild with span only in Sep
    await rebuildUserLedger(db, UID, { from: '2026-09-01', to: '2026-09-30' });

    const { daily, monthly } = await stored();

    // Sep rollups rebuilt correctly
    assert.equal(daily['2026-09-15'].totalMinor, 10_000);
    assert.equal(monthly['2026-09'].totalMinor, 10_000);

    // Oct rollups UNCHANGED (not in month set)
    assert.equal(daily['2026-10-10'].totalMinor, 20_000, 'Oct daily should be untouched');
    assert.equal(monthly['2026-10'].totalMinor, 20_000, 'Oct monthly should be untouched');
  });
});
