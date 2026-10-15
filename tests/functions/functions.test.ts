import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import * as admin from 'firebase-admin';

import {
  firestorePaths,
  parseCoinLedgerEntry,
  parseStreak,
  parseWallet,
} from '../../packages/shared/src';
import {
  handleCategoryCreate,
  handleCheckInCreate,
  handleExpenseWrite,
} from '../../functions/src/handlers';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

const ALICE = 'user-alice';
let app: admin.app.App;
let db: admin.firestore.Firestore;

async function clearUser(uid: string): Promise<void> {
  const collections = ['expenses', 'checkIns', 'coinLedger', 'categories'];
  for (const col of collections) {
    const snap = await db.collection(`users/${uid}/${col}`).get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
  const singletons = ['streak/main', 'wallet/main', 'settings/app'];
  for (const s of singletons) {
    await db.doc(`users/${uid}/${s}`).delete();
  }
}

async function getWallet(uid: string) {
  const snap = await db.doc(firestorePaths.wallet(uid)).get();
  return snap.exists ? parseWallet(uid, snap.data()) : { coinBalance: 0 };
}

async function getStreak(uid: string) {
  const snap = await db.doc(firestorePaths.streak(uid)).get();
  return snap.exists ? parseStreak(uid, snap.data()) : { current: 0, longest: 0, lastLoggedOn: null };
}

async function getLedger(uid: string) {
  const snap = await db.collection(firestorePaths.coinLedger(uid)).get();
  return snap.docs.map((d) => parseCoinLedgerEntry(uid, d.id, d.data()));
}

before(async () => {
  app = admin.apps.length > 0 ? admin.app() : admin.initializeApp({ projectId: 'demo-loop' });
  db = app.firestore();
});

beforeEach(async () => {
  await clearUser(ALICE);
});

describe('L3 Functions — Check-ins & Streaks', () => {
  it('double check-in creates one check_in ledger entry and awards zero-spend bonus if no expenses', async () => {
    const date = '2026-09-01';
    await handleCheckInCreate(db, ALICE, date, `${date}T10:00:00.000Z`);
    
    // Call handler a second time to verify idempotency
    await handleCheckInCreate(db, ALICE, date, `${date}T11:00:00.000Z`);

    const ledger = await getLedger(ALICE);
    const checkInEntries = ledger.filter((e) => e.ruleId === 'check_in');
    const zeroSpendEntries = ledger.filter((e) => e.ruleId === 'zero_spend');

    assert.equal(checkInEntries.length, 1, 'exactly one check_in entry');
    assert.equal(zeroSpendEntries.length, 1, 'exactly one zero_spend entry');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 8, '5 (check_in) + 3 (zero_spend) = 8 coins');
    assert.equal(wallet.coinBalance, ledger.reduce((s, e) => s + e.coins, 0));

    const streak = await getStreak(ALICE);
    assert.equal(streak.current, 1);
    assert.equal(streak.lastLoggedOn, date);
  });

  it('7-day run awards week_complete (25 coins) once on the 7th day', async () => {
    for (let day = 1; day <= 7; day++) {
      const date = `2026-09-0${day}`;
      await handleCheckInCreate(db, ALICE, date, `${date}T10:00:00.000Z`);
    }

    const streak = await getStreak(ALICE);
    assert.equal(streak.current, 7);
    assert.equal(streak.longest, 7);

    const ledger = await getLedger(ALICE);
    const weekCompleteEntries = ledger.filter((e) => e.ruleId === 'week_complete');
    assert.equal(weekCompleteEntries.length, 1, 'week_complete awarded exactly once');
    assert.equal(weekCompleteEntries[0].coins, 25);

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, ledger.reduce((s, e) => s + e.coins, 0));
  });
});

describe('L3 Functions — Expenses & Daily Caps', () => {
  it('10 expenses in a day awards at most 6 expense_logged coins (capped at 3) and 3 categorised coins', async () => {
    const date = '2026-09-05';
    const now = `${date}T10:00:00.000Z`;

    for (let i = 1; i <= 10; i++) {
      const expenseId = `exp-${i}`;
      const expenseData = {
        amountMinor: 10000,
        currency: 'INR',
        localDate: date,
        categoryId: 'cat-food',
        createdAt: now,
        occurredAt: now,
        deletedAt: null,
      };
      await handleExpenseWrite(db, ALICE, expenseId, null, expenseData, now);
    }

    const ledger = await getLedger(ALICE);
    const loggedEntries = ledger.filter((e) => e.ruleId === 'expense_logged');
    const categorisedEntries = ledger.filter((e) => e.ruleId === 'categorised');
    const firstExpenseEntries = ledger.filter((e) => e.ruleId === 'first_expense');

    assert.equal(loggedEntries.length, 3, 'expense_logged capped at 3');
    assert.equal(categorisedEntries.length, 3, 'categorised capped at 3');
    assert.equal(firstExpenseEntries.length, 1, 'first_expense awarded once');

    const wallet = await getWallet(ALICE);
    // first_expense (10) + 3 * expense_logged (3*2=6) + 3 * categorised (3*1=3) = 19
    assert.equal(wallet.coinBalance, 19);
    assert.equal(wallet.coinBalance, ledger.reduce((s, e) => s + e.coins, 0));
  });

  it('deleting an expense causes no clawback — balance and ledger remain intact', async () => {
    const date = '2026-09-05';
    const now = `${date}T10:00:00.000Z`;
    const expenseId = 'exp-del';
    const expenseData = {
      amountMinor: 5000,
      currency: 'INR',
      localDate: date,
      categoryId: 'cat-food',
      createdAt: now,
      occurredAt: now,
      deletedAt: null,
    };

    // Create
    await handleExpenseWrite(db, ALICE, expenseId, null, expenseData, now);
    const balanceBefore = (await getWallet(ALICE)).coinBalance;
    assert.ok(balanceBefore > 0);

    // Delete (soft delete update)
    const deletedData = { ...expenseData, deletedAt: `${date}T12:00:00.000Z` };
    await handleExpenseWrite(db, ALICE, expenseId, expenseData, deletedData, now);

    const balanceAfter = (await getWallet(ALICE)).coinBalance;
    assert.equal(balanceAfter, balanceBefore, 'no coins clawed back on delete');
  });

  it('backdated expense does not create a check-in or award past coins', async () => {
    const createdDate = '2026-09-10';
    const pastExpenseDate = '2026-09-01';
    const createdAt = `${createdDate}T10:00:00.000Z`;
    const occurredAt = `${pastExpenseDate}T10:00:00.000Z`;

    const expenseData = {
      amountMinor: 5000,
      currency: 'INR',
      localDate: pastExpenseDate,
      categoryId: 'cat-food',
      createdAt,
      occurredAt,
      deletedAt: null,
    };

    await handleExpenseWrite(db, ALICE, 'exp-backdated', null, expenseData, createdAt);

    // Check-in for 2026-09-01 should not be created
    const checkInSnap = await db.doc(firestorePaths.checkIn(ALICE, pastExpenseDate)).get();
    assert.equal(checkInSnap.exists, false, 'no check-in created for past date');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0, 'no coins awarded for backdated expense');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 0);
  });

  it('expense with createdLocalDate allows west-of-UTC evening logging (not backdated)', async () => {
    // New York user logging at 20:30 local (2026-03-03), which is 01:30 UTC (2026-03-04)
    const createdAt = '2026-03-04T01:30:00.000Z';
    const occurredAt = createdAt;
    const localDate = '2026-03-03';
    const createdLocalDate = '2026-03-03';

    const expenseData = {
      amountMinor: 5000,
      currency: 'USD',
      localDate,
      createdLocalDate,
      categoryId: 'cat-food',
      createdAt,
      occurredAt,
      deletedAt: null,
    };

    await handleExpenseWrite(db, ALICE, 'exp-ny-evening', null, expenseData, createdAt);

    // Check-in should be created for 2026-03-03
    const checkInSnap = await db.doc(firestorePaths.checkIn(ALICE, localDate)).get();
    assert.equal(checkInSnap.exists, true, 'check-in created for local date');

    const ledger = await getLedger(ALICE);
    assert.ok(ledger.length > 0, 'coins awarded (not backdated)');

    const wallet = await getWallet(ALICE);
    assert.ok(wallet.coinBalance > 0, 'coins awarded');
  });

  it('v1 expense without createdLocalDate uses old UTC-based comparison', async () => {
    // Simulate a v1 document without createdLocalDate
    const date = '2026-09-10';
    const createdAt = `${date}T10:00:00.000Z`;
    const occurredAt = createdAt;

    const expenseData = {
      amountMinor: 5000,
      currency: 'INR',
      localDate: date,
      // No createdLocalDate field
      categoryId: 'cat-food',
      createdAt,
      occurredAt,
      deletedAt: null,
    };

    await handleExpenseWrite(db, ALICE, 'exp-v1', null, expenseData, createdAt);

    // Check-in should be created
    const checkInSnap = await db.doc(firestorePaths.checkIn(ALICE, date)).get();
    assert.equal(checkInSnap.exists, true, 'check-in created using fallback logic');

    const ledger = await getLedger(ALICE);
    assert.ok(ledger.length > 0, 'coins awarded with v1 fallback');
  });

  it('genuinely backdated expense with createdLocalDate awards no check-in or coins', async () => {
    // Expense with localDate earlier than createdLocalDate
    const createdAt = '2026-03-10T10:00:00.000Z';
    const occurredAt = '2026-03-03T10:00:00.000Z';
    const localDate = '2026-03-03';
    const createdLocalDate = '2026-03-10';

    const expenseData = {
      amountMinor: 5000,
      currency: 'USD',
      localDate,
      createdLocalDate,
      categoryId: 'cat-food',
      createdAt,
      occurredAt,
      deletedAt: null,
    };

    await handleExpenseWrite(db, ALICE, 'exp-truly-backdated', null, expenseData, createdAt);

    // Check-in should NOT be created
    const checkInSnap = await db.doc(firestorePaths.checkIn(ALICE, localDate)).get();
    assert.equal(checkInSnap.exists, false, 'no check-in for genuinely backdated expense');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0, 'no coins for genuinely backdated expense');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 0);
  });

  it('handler run twice on the same expense is completely idempotent', async () => {
    const date = '2026-09-05';
    const now = `${date}T10:00:00.000Z`;
    const expenseData = {
      amountMinor: 5000,
      currency: 'INR',
      localDate: date,
      categoryId: 'cat-coffee',
      createdAt: now,
      occurredAt: now,
      deletedAt: null,
    };

    await handleExpenseWrite(db, ALICE, 'exp-dup', null, expenseData, now);
    const ledgerFirst = await getLedger(ALICE);
    const balanceFirst = (await getWallet(ALICE)).coinBalance;

    // Run again
    await handleExpenseWrite(db, ALICE, 'exp-dup', null, expenseData, now);
    const ledgerSecond = await getLedger(ALICE);
    const balanceSecond = (await getWallet(ALICE)).coinBalance;

    assert.equal(ledgerSecond.length, ledgerFirst.length);
    assert.equal(balanceSecond, balanceFirst);
  });
});

describe('L3 Functions — Custom Category Creation', () => {
  it('first custom category awards first_custom_category (5 coins) once', async () => {
    const now = '2026-09-05T10:00:00.000Z';
    await handleCategoryCreate(db, ALICE, 'cat-c1', { kind: 'custom', name: 'Art' }, now);

    const ledger1 = await getLedger(ALICE);
    assert.equal(ledger1.length, 1);
    assert.equal(ledger1[0].ruleId, 'first_custom_category');
    assert.equal(ledger1[0].coins, 5);

    // Second custom category
    await handleCategoryCreate(db, ALICE, 'cat-c2', { kind: 'custom', name: 'Music' }, now);
    const ledger2 = await getLedger(ALICE);
    assert.equal(ledger2.length, 1, 'first_custom_category is once-only');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 5);
  });
});

describe('L3 Functions — Expense Matrix (kind × source)', () => {
  const NOW = '2026-09-05T10:00:00.000Z';
  const DATE = '2026-09-05';

  beforeEach(async () => {
    await clearUser(ALICE);
  });

  // Helper to create a basic expense
  function makeExpense(overrides: Record<string, unknown> = {}) {
    return {
      amountMinor: 5000,
      currency: 'INR',
      localDate: DATE,
      categoryId: 'cat-coffee',
      createdAt: NOW,
      occurredAt: NOW,
      deletedAt: null,
      ...overrides,
    };
  }

  it('manual expense → check-in + expense_logged (+ categorised + first_expense)', async () => {
    // Create a custom category first so we can test categorised
    await db.doc(firestorePaths.category(ALICE, 'cat-coffee')).set({
      slug: 'COFFEE',
      name: 'Coffee',
      icon: { kind: 'glyph', name: 'coffee' },
      colorToken: 'BROWN',
      kind: 'custom',
      sortOrder: 0,
      createdAt: NOW,
      archivedAt: null,
    });

    await handleExpenseWrite(db, ALICE, 'exp1', null, makeExpense({ source: 'manual' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(checkIn.exists, 'check-in should exist');

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.deepEqual(rules, ['categorised', 'expense_logged', 'first_expense']);

    const wallet = await getWallet(ALICE);
    // expense_logged(2) + categorised(1) + first_expense(10) = 13
    // check_in is NOT awarded here (only via handleCheckInCreate/day_banked)
    assert.equal(wallet.coinBalance, 2 + 1 + 10);
  });

  it('sms expense → check-in + expense_logged (+ categorised + first_expense)', async () => {
    await db.doc(firestorePaths.category(ALICE, 'cat-coffee')).set({
      slug: 'COFFEE',
      name: 'Coffee',
      icon: { kind: 'glyph', name: 'coffee' },
      colorToken: 'BROWN',
      kind: 'custom',
      sortOrder: 0,
      createdAt: NOW,
      archivedAt: null,
    });

    await handleExpenseWrite(db, ALICE, 'exp1', null, makeExpense({ source: 'sms' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(checkIn.exists, 'check-in should exist');

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.deepEqual(rules, ['categorised', 'expense_logged', 'first_expense']);
  });

  it('manual income → check-in only, no coins', async () => {
    await handleExpenseWrite(db, ALICE, 'inc1', null, makeExpense({ kind: 'income', source: 'manual' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(checkIn.exists, 'check-in should exist');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0, 'no coins for income');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 0);
  });

  it('manual refund → check-in only, no coins', async () => {
    await handleExpenseWrite(db, ALICE, 'ref1', null, makeExpense({ kind: 'refund', source: 'manual' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(checkIn.exists, 'check-in should exist');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0, 'no coins for refund');
  });

  it('transfer → nothing (no check-in, no coins)', async () => {
    await handleExpenseWrite(
      db,
      ALICE,
      'tx1',
      null,
      makeExpense({ kind: 'transfer', accountId: 'acc-a', toAccountId: 'acc-b' }),
      NOW,
    );

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(!checkIn.exists, 'no check-in for transfer');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0);
  });

  it('settlement → nothing (bookkeeping)', async () => {
    await handleExpenseWrite(db, ALICE, 'st1', null, makeExpense({ kind: 'settlement' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(!checkIn.exists);

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0);
  });

  it('loan → nothing (bookkeeping)', async () => {
    await handleExpenseWrite(db, ALICE, 'ln1', null, makeExpense({ kind: 'loan' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(!checkIn.exists);

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0);
  });

  it('expense with recurringId → check-in only, no coins', async () => {
    await handleExpenseWrite(
      db,
      ALICE,
      'exp-rec',
      null,
      makeExpense({ recurringId: 'rec-rent', source: 'manual' }),
      NOW,
    );

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(checkIn.exists, 'check-in should exist for recurring');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0, 'no coins for recurring');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 0);
  });

  it('source: group (squad mirror) → nothing', async () => {
    await handleExpenseWrite(db, ALICE, 'exp-group', null, makeExpense({ source: 'group' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(!checkIn.exists, 'no check-in for group mirror');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0);
  });

  it('source: import → nothing (also no rollups)', async () => {
    await handleExpenseWrite(db, ALICE, 'exp-import', null, makeExpense({ source: 'import' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(!checkIn.exists, 'no check-in for import');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0);
  });

  it('source: shared → treated as own entry (check-in + coins for expense)', async () => {
    await db.doc(firestorePaths.category(ALICE, 'cat-coffee')).set({
      slug: 'COFFEE',
      name: 'Coffee',
      icon: { kind: 'glyph', name: 'coffee' },
      colorToken: 'BROWN',
      kind: 'custom',
      sortOrder: 0,
      createdAt: NOW,
      archivedAt: null,
    });

    await handleExpenseWrite(db, ALICE, 'exp-shared', null, makeExpense({ source: 'shared' }), NOW);

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, DATE)).get();
    assert.ok(checkIn.exists, 'check-in should exist for shared');

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.deepEqual(rules, ['categorised', 'expense_logged', 'first_expense']);
  });

  it('update (beforeData exists) → no check-in, no coins', async () => {
    // First create
    await handleExpenseWrite(db, ALICE, 'exp1', null, makeExpense({ source: 'manual' }), NOW);
    const ledgerAfterCreate = await getLedger(ALICE);
    const balanceAfterCreate = (await getWallet(ALICE)).coinBalance;

    // Now update
    await handleExpenseWrite(
      db,
      ALICE,
      'exp1',
      makeExpense({ source: 'manual' }),
      makeExpense({ source: 'manual', amountMinor: 6000 }),
      NOW,
    );

    const ledgerAfterUpdate = await getLedger(ALICE);
    const balanceAfterUpdate = (await getWallet(ALICE)).coinBalance;

    assert.equal(ledgerAfterUpdate.length, ledgerAfterCreate.length, 'no new coins on update');
    assert.equal(balanceAfterUpdate, balanceAfterCreate, 'balance unchanged on update');
  });

  it('soft delete (afterData.deletedAt) → no check-in, no coins', async () => {
    // First create
    await handleExpenseWrite(db, ALICE, 'exp1', null, makeExpense({ source: 'manual' }), NOW);
    const ledgerAfterCreate = await getLedger(ALICE);
    const balanceAfterCreate = (await getWallet(ALICE)).coinBalance;

    // Now soft delete
    await handleExpenseWrite(
      db,
      ALICE,
      'exp1',
      makeExpense({ source: 'manual' }),
      makeExpense({ source: 'manual', deletedAt: '2026-09-05T11:00:00.000Z' }),
      NOW,
    );

    const ledgerAfterDelete = await getLedger(ALICE);
    const balanceAfterDelete = (await getWallet(ALICE)).coinBalance;

    assert.equal(ledgerAfterDelete.length, ledgerAfterCreate.length, 'no new coins on soft delete');
    assert.equal(balanceAfterDelete, balanceAfterCreate, 'balance unchanged on soft delete');
  });

  it('backdated expense (localDate < createdLocalDate) → nothing', async () => {
    const backdatedNow = '2026-09-05T10:00:00.000Z';
    const backdatedCreatedAt = '2026-09-03T10:00:00.000Z'; // Created on 09-03
    await handleExpenseWrite(
      db,
      ALICE,
      'exp-backdated',
      null,
      makeExpense({
        source: 'manual',
        localDate: '2026-09-01', // Occurred on 09-01
        createdAt: backdatedCreatedAt,
        createdLocalDate: '2026-09-03',
      }),
      backdatedNow,
    );

    const checkIn = await db.doc(firestorePaths.checkIn(ALICE, '2026-09-01')).get();
    assert.ok(!checkIn.exists, 'no check-in for backdated');

    const ledger = await getLedger(ALICE);
    assert.equal(ledger.length, 0, 'no coins for backdated');
  });

  it('expense in OTHER category → NOT categorised', async () => {
    // Use OTHER category (system slug = OTHER)
    await handleExpenseWrite(
      db,
      ALICE,
      'exp-other',
      null,
      makeExpense({ categoryId: 'OTHER', source: 'manual' }),
      NOW,
    );

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(!rules.includes('categorised'), 'OTHER should not count as categorised');
    assert.ok(rules.includes('expense_logged'), 'should still get expense_logged');
  });

  it('custom category "Mother\'s Day" → categorised (slug not OTHER)', async () => {
    // Create a custom category named "Mother's Day" with slug MOTHERS_DAY
    await db.doc(firestorePaths.category(ALICE, 'cat-mothers-day')).set({
      slug: 'MOTHERS_DAY',
      name: "Mother's Day",
      icon: { kind: 'glyph', name: 'gift' },
      colorToken: 'PINK',
      kind: 'custom',
      sortOrder: 0,
      createdAt: NOW,
      archivedAt: null,
    });

    await handleExpenseWrite(
      db,
      ALICE,
      'exp-mothers',
      null,
      makeExpense({ categoryId: 'cat-mothers-day', source: 'manual' }),
      NOW,
    );

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('categorised'), "Mother's Day should count as categorised");
  });

  it('expense_logged dailyCap (3 per day) enforced', async () => {
    await db.doc(firestorePaths.category(ALICE, 'cat-coffee')).set({
      slug: 'COFFEE',
      name: 'Coffee',
      icon: { kind: 'glyph', name: 'coffee' },
      colorToken: 'BROWN',
      kind: 'custom',
      sortOrder: 0,
      createdAt: NOW,
      archivedAt: null,
    });

    // Create 4 expenses on same day
    for (let i = 0; i < 4; i++) {
      await handleExpenseWrite(
        db,
        ALICE,
        `exp${i}`,
        null,
        makeExpense({ source: 'manual' }),
        NOW,
      );
    }

    const ledger = await getLedger(ALICE);
    const expenseLogged = ledger.filter((e) => e.ruleId === 'expense_logged');
    assert.equal(expenseLogged.length, 3, 'dailyCap of 3 enforced for expense_logged');

    // check_in is NOT awarded via handleExpenseWrite (only via handleCheckInCreate/day_banked)
    const checkIn = ledger.filter((e) => e.ruleId === 'check_in');
    assert.equal(checkIn.length, 0, 'check_in not awarded via handleExpenseWrite');
  });
});

describe('L3 Functions — Zero-spend', () => {
  const NOW = '2026-09-05T10:00:00.000Z';
  const DATE = '2026-09-05';

  beforeEach(async () => {
    await clearUser(ALICE);
  });

  function makeExpense(overrides: Record<string, unknown> = {}) {
    return {
      amountMinor: 5000,
      currency: 'INR',
      localDate: DATE,
      categoryId: 'cat-coffee',
      createdAt: NOW,
      occurredAt: NOW,
      deletedAt: null,
      ...overrides,
    };
  }

  it('income-only day → zero-spend (awards zero_spend)', async () => {
    await handleExpenseWrite(db, ALICE, 'inc1', null, makeExpense({ kind: 'income', amountMinor: 10000 }), NOW);

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('check_in'), 'check-in awarded');
    assert.ok(rules.includes('zero_spend'), 'zero-spend awarded for income-only day');

    const wallet = await getWallet(ALICE);
    assert.equal(wallet.coinBalance, 5 + 3); // check_in(5) + zero_spend(3)
  });

  it('refund-only day → zero-spend', async () => {
    await handleExpenseWrite(db, ALICE, 'ref1', null, makeExpense({ kind: 'refund', amountMinor: 5000 }), NOW);

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('zero_spend'), 'zero-spend awarded for refund-only day');
  });

  it('transfer-only day → zero-spend', async () => {
    await handleExpenseWrite(
      db,
      ALICE,
      'tx1',
      null,
      makeExpense({ kind: 'transfer', amountMinor: 5000, accountId: 'acc-a', toAccountId: 'acc-b' }),
      NOW,
    );

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('zero_spend'), 'zero-spend awarded for transfer-only day');
  });

  it('expense with excludeFromSpend → zero-spend', async () => {
    await handleExpenseWrite(
      db,
      ALICE,
      'exp-excluded',
      null,
      makeExpense({ kind: 'expense', amountMinor: 5000, excludeFromSpend: true }),
      NOW,
    );

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('zero_spend'), 'excluded expense does not break zero-spend');
  });

  it('day with a counting mirror (source: group, amountMinor > 0) → NOT zero-spend', async () => {
    // Real mirror: stores user's share in amountMinor, allocations: []
    const mirror = makeExpense({
      source: 'group',
      amountMinor: 1200, // user's share
      allocations: [],
      groupId: 'grp-123',
    });
    await db.doc(firestorePaths.expense(ALICE, 'exp-group')).set(mirror);
    await handleExpenseWrite(db, ALICE, 'exp-group', null, mirror, NOW);

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(!rules.includes('zero_spend'), 'counting mirror breaks zero-spend');
    assert.ok(rules.includes('check_in'), 'check-in still awarded');
  });

  it('mirror with amountMinor 0 → zero-spend', async () => {
    // Mirror with 0 share (user owes nothing)
    const mirror = makeExpense({
      source: 'group',
      amountMinor: 0,
      allocations: [],
      groupId: 'grp-123',
    });
    await db.doc(firestorePaths.expense(ALICE, 'exp-group-zero')).set(mirror);
    await handleExpenseWrite(db, ALICE, 'exp-group-zero', null, mirror, NOW);

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('zero_spend'), 'mirror with 0 share does not break zero-spend');
  });

  it('day with an excluded mirror (source: group, excludeFromSpend) → zero-spend', async () => {
    const mirror = makeExpense({
      source: 'group',
      amountMinor: 3000,
      excludeFromSpend: true,
      allocations: [],
      groupId: 'grp-123',
    });
    await db.doc(firestorePaths.expense(ALICE, 'exp-group-excl')).set(mirror);
    await handleExpenseWrite(db, ALICE, 'exp-group-excl', null, mirror, NOW);

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('zero_spend'), 'excluded mirror does not break zero-spend');
  });

  it('expense with amountMinor === 0 → zero-spend (amount must be > 0)', async () => {
    await handleExpenseWrite(
      db,
      ALICE,
      'exp-zero',
      null,
      makeExpense({ kind: 'expense', amountMinor: 0 }),
      NOW,
    );

    await handleCheckInCreate(db, ALICE, DATE, NOW);

    const ledger = await getLedger(ALICE);
    const rules = ledger.map((e) => e.ruleId).sort();
    assert.ok(rules.includes('zero_spend'), 'zero amount does not break zero-spend');
  });
});
