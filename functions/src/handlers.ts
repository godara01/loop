import {
  type CoinContext,
  type CoinLedgerEntry,
  type CoinRuleId,
  COIN_RULES,
  EMPTY_STREAK,
  completesWeek,
  evaluateCoinEvent,
  firestorePaths,
  localDateOf,
  parseCoinLedgerEntry,
  parseStreak,
  recordActivity,
  streakToDoc,
} from '@loop/shared';

import { awardCoins } from './award-coins';

async function fetchCoinContext(
  db: FirebaseFirestore.Firestore,
  uid: string,
  localDate: string,
  createdAt: string,
): Promise<CoinContext> {
  const ledgerSnap = await db.collection(firestorePaths.coinLedger(uid)).get();
  const allEntries: CoinLedgerEntry[] = [];
  
  for (const doc of ledgerSnap.docs) {
    try {
      allEntries.push(parseCoinLedgerEntry(uid, doc.id, doc.data()));
    } catch {
      // Ignore malformed
    }
  }

  const entriesToday = allEntries.filter((e) => e.localDate === localDate);
  
  const onceRulesAwarded: CoinRuleId[] = Array.from(
    new Set(allEntries.filter((e) => COIN_RULES[e.ruleId]?.scope === 'once').map((e) => e.ruleId))
  );

  return {
    localDate,
    createdAt,
    entriesToday,
    onceRulesAwarded,
  };
}

export async function handleExpenseWrite(
  db: FirebaseFirestore.Firestore,
  uid: string,
  expenseId: string,
  beforeData: FirebaseFirestore.DocumentData | null,
  afterData: FirebaseFirestore.DocumentData | null,
  now: string = new Date().toISOString(),
): Promise<void> {
  // If deleted or soft-deleted, do nothing
  if (!afterData || afterData.deletedAt !== null) return;

  // If this is an update (beforeData exists), do nothing regarding coins and check-ins
  if (beforeData) return;

  const localDate = afterData.localDate;
  const createdAt = afterData.createdAt ?? now;
  const categoryId = afterData.categoryId ?? 'OTHER';

  // Backdating rule: if localDate is before the day it was created, it's backdated.
  const loggedDate = localDateOf(createdAt);
  const isBackdated = localDate < loggedDate;

  if (isBackdated) {
    return; // No check-in and no coins for backdated expenses
  }

  // Ensure today's check-in exists
  const checkInRef = db.doc(firestorePaths.checkIn(uid, localDate));
  const checkInDoc = await checkInRef.get();
  if (!checkInDoc.exists) {
    await checkInRef.set({ localDate });
  }

  let coinCtx = await fetchCoinContext(db, uid, localDate, createdAt);
  
  const isFirstEver = !coinCtx.onceRulesAwarded.includes('first_expense');
  const categorised = categoryId !== 'cat-other' && categoryId !== 'OTHER' && !categoryId.toLowerCase().includes('other');

  const entries = evaluateCoinEvent(
    { kind: 'expense_logged', expenseId, categorised, isFirstEver },
    coinCtx,
  );

  await awardCoins(db, uid, entries);
}

export async function handleCheckInCreate(
  db: FirebaseFirestore.Firestore,
  uid: string,
  localDate: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  // 1. Advance streak
  const streakRef = db.doc(firestorePaths.streak(uid));
  const streakDoc = await streakRef.get();
  const existingStreak = streakDoc.exists ? parseStreak(uid, streakDoc.data()) : EMPTY_STREAK;
  
  const newStreak = recordActivity(existingStreak, localDate);
  await streakRef.set(streakToDoc(newStreak));

  // 2. Check for zero-spend today
  const expensesSnap = await db
    .collection(firestorePaths.expenses(uid))
    .where('localDate', '==', localDate)
    .get();
    
  const activeCount = expensesSnap.docs.filter((d) => !d.data()?.deletedAt).length;
  const zeroSpend = activeCount === 0;

  // 3. Award coins
  let coinCtx = await fetchCoinContext(db, uid, localDate, now);
  const entries = evaluateCoinEvent({ kind: 'day_banked', zeroSpend }, coinCtx);
  
  if (completesWeek(newStreak.current)) {
    // Re-evaluate context considering newly proposed entries
    coinCtx = { ...coinCtx, entriesToday: [...coinCtx.entriesToday, ...entries] };
    const weekEntries = evaluateCoinEvent({ kind: 'week_completed' }, coinCtx);
    entries.push(...weekEntries);
  }

  await awardCoins(db, uid, entries);
}

export async function handleCategoryCreate(
  db: FirebaseFirestore.Firestore,
  uid: string,
  categoryId: string,
  data: FirebaseFirestore.DocumentData,
  now: string = new Date().toISOString(),
): Promise<void> {
  if (data.kind !== 'custom') return;

  const localDate = localDateOf(now);
  const coinCtx = await fetchCoinContext(db, uid, localDate, now);
  
  const isFirstEver = !coinCtx.onceRulesAwarded.includes('first_custom_category');
  if (isFirstEver) {
    const entries = evaluateCoinEvent(
      { kind: 'custom_category_created', categoryId, isFirstEver },
      coinCtx,
    );
    await awardCoins(db, uid, entries);
  }
}
