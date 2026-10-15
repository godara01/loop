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
import { updateRollups } from './rollups';

/** System category slugs that do NOT count as "categorised". */
const UNCATEGORISED_SLUGS = new Set(['OTHER', 'OTHER_IN']);

/**
 * Check if an expense's category counts as "categorised".
 * Looks up the category in the user's categories collection and the system catalogue.
 * Returns false if slug is OTHER or OTHER_IN.
 */
async function isCategorised(
  db: FirebaseFirestore.Firestore,
  uid: string,
  categoryId: string,
): Promise<boolean> {
  // Check user's own categories first
  const userCatSnap = await db.doc(firestorePaths.category(uid, categoryId)).get();
  if (userCatSnap.exists) {
    const slug = userCatSnap.data()?.slug;
    return slug !== undefined && !UNCATEGORISED_SLUGS.has(slug);
  }

  // Fall back to system catalogue (essential + catalogue categories)
  // The catalogue uses the same categoryId as slug for system categories
  // We need to check if categoryId is a known system category with slug OTHER/OTHER_IN
  // For now, we assume system categories have slug = categoryId
  // If it's not found in user's categories, it's likely a custom category not yet synced
  // or a system category. System categories have known slugs.
  // OTHER and OTHER_IN are the only uncategorised system slugs.
  return !UNCATEGORISED_SLUGS.has(categoryId);
}

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
  // Before the deleted/soft-deleted early return: removing an expense must
  // take it back out of the rollups.
  // Skip import creates: beforeData === null && afterData?.source === 'import'
  // finalizeImport will call rebuildUserLedger to bring them in.
  const skipImportCreate = beforeData === null && afterData?.source === 'import';
  await updateRollups(db, uid, expenseId, { skipImportCreate });

  // If deleted or soft-deleted, do nothing for coins/check-ins
  if (!afterData || afterData.deletedAt !== null) return;

  // If this is an update (beforeData exists), do nothing regarding coins and check-ins
  if (beforeData) return;

  // This is a CREATE of a live expense
  const localDate = afterData.localDate;
  const createdAt = afterData.createdAt ?? now;
  const kind = (afterData.kind ?? 'expense') as string;
  const categoryId = afterData.categoryId ?? 'OTHER';
  const source = afterData.source ?? 'manual';
  const recurringId = afterData.recurringId ?? null;

  // Backdating rule: if localDate is before the day it was created, it's backdated.
  const createdLocalDate = afterData.createdLocalDate ?? null;
  const loggedDate = createdLocalDate ?? localDateOf(createdAt);
  const isBackdated = localDate < loggedDate;

  if (isBackdated) {
    return; // No check-in and no coins for backdated expenses
  }

  // ----- KIND × SOURCE MATRIX -----
  // Determine what actions to take based on kind and source
  let shouldCheckIn = false;
  let shouldAwardExpenseLogged = false;
  let categorised = false;

  const isGroup = source === 'group';
  const isImport = source === 'import';
  const isRecurring = recurringId !== null;

  if (isGroup || isImport) {
    // Squad mirror and import: nothing
    shouldCheckIn = false;
    shouldAwardExpenseLogged = false;
  } else if (isRecurring) {
    // Any kind with recurringId set: check-in only, no coins
    shouldCheckIn = true;
    shouldAwardExpenseLogged = false;
  } else if (kind === 'transfer' || kind === 'settlement' || kind === 'loan') {
    // Bookkeeping kinds: nothing
    shouldCheckIn = false;
    shouldAwardExpenseLogged = false;
  } else if (kind === 'income' || kind === 'refund') {
    // Income/refund: check-in only, no coins
    shouldCheckIn = true;
    shouldAwardExpenseLogged = false;
  } else if (kind === 'expense' || kind === undefined) {
    // Expense (default): check-in + expense_logged coins
    shouldCheckIn = true;
    shouldAwardExpenseLogged = true;
    categorised = await isCategorised(db, uid, categoryId);
  } else {
    // Unknown kind: conservative - nothing
    shouldCheckIn = false;
    shouldAwardExpenseLogged = false;
  }

  // Ensure today's check-in exists if needed
  if (shouldCheckIn) {
    const checkInRef = db.doc(firestorePaths.checkIn(uid, localDate));
    const checkInDoc = await checkInRef.get();
    if (!checkInDoc.exists) {
      await checkInRef.set({ localDate });
    }
  }

  // Award coins if needed
  if (shouldAwardExpenseLogged) {
    let coinCtx = await fetchCoinContext(db, uid, localDate, createdAt);
    const isFirstEver = !coinCtx.onceRulesAwarded.includes('first_expense');

    const entries = evaluateCoinEvent(
      { kind: 'expense_logged', expenseId, categorised, isFirstEver },
      coinCtx,
    );

    await awardCoins(db, uid, entries);
  }
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
  // Zero-spend: count only live docs on that localDate with kind 'expense'
  // (missing kind = expense), amountMinor > 0, not excludeFromSpend.
  // Income, refund, transfer, settlement, loan, excluded mirrors do not break zero-spend.
  // A mirror (source: 'group') breaks zero-spend by the SAME rule: its amountMinor IS the user's share.
  const expensesSnap = await db
    .collection(firestorePaths.expenses(uid))
    .where('localDate', '==', localDate)
    .get();

  let hasSpend = false;
  for (const doc of expensesSnap.docs) {
    const data = doc.data();
    if (!data) continue;
    if (data.deletedAt !== null && data.deletedAt !== undefined) continue;

    const kind = (data.kind ?? 'expense') as string;
    const amountMinor = data.amountMinor ?? data.total?.minor ?? 0;
    const excludeFromSpend = data.excludeFromSpend ?? false;

    // Unified rule: breaks zero-spend iff kind is expense (or missing), amountMinor > 0, not excluded
    if (kind === 'expense' && amountMinor > 0 && !excludeFromSpend) {
      hasSpend = true;
      break;
    }
    // All other kinds (income, refund, transfer, settlement, loan) don't break zero-spend
    // Excluded items (excludeFromSpend: true) don't break zero-spend
    // Mirrors with amountMinor === 0 don't break zero-spend
  }

  const zeroSpend = !hasSpend;

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