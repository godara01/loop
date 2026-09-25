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
