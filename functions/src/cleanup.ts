import type * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

const DAY_MS = 86_400_000;
/** Bounded work per scheduled run: at most PAGE_SIZE x MAX_PAGES documents. */
const PAGE_SIZE = 300;
const MAX_PAGES = 50;

/** Only personal data at users/{uid}/…; a v1.1 groups/{g}/expenses is not this sweep's to touch. */
function isUserDoc(ref: admin.firestore.DocumentReference): boolean {
  return ref.parent.parent?.parent.id === 'users';
}

function cutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

// ── C1 · Soft-deleted expenses ────────────────────────────────────────────

export const SOFT_DELETE_RETENTION_DAYS = 90;

/**
 * Hard-deletes expenses soft-deleted MORE than 90 days ago (exactly 90 is
 * kept). Rollups are untouched: the soft delete already took the expense out,
 * and the delete trigger then sees no contribution on either side.
 *
 * Collection-group query on `deletedAt` — a range filter only matches string
 * values, so live expenses (deletedAt null) never come back. Indexed in
 * firestore.indexes.json (fieldOverrides, COLLECTION_GROUP).
 */
export async function cleanupSoftDeletedExpenses(db: admin.firestore.Firestore, now: Date): Promise<number> {
  const before = cutoff(now, SOFT_DELETE_RETENTION_DAYS);
  let deleted = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const snap = await db
      .collectionGroup('expenses')
      .where('deletedAt', '<', before)
      .orderBy('deletedAt')
      .limit(PAGE_SIZE)
      .get();
    const docs = snap.docs.filter((d) => isUserDoc(d.ref));
    if (docs.length === 0) break;
    const batch = db.batch();
    for (const d of docs) batch.delete(d.ref);
    await batch.commit();
    deleted += docs.length;
    if (snap.size < PAGE_SIZE) break;
  }
  return deleted;
}

// ── C2 · Pending-expense expiry ───────────────────────────────────────────

export const PENDING_EXPIRY_DAYS = 30;

/**
 * Marks `pending` items received more than 30 days ago as `expired`, so the
 * inbox never becomes a graveyard. Never deletes: every item keeps its
 * decision history. Approved, rejected and expired items are not matched.
 */
export async function expireStalePendingExpenses(db: admin.firestore.Firestore, now: Date): Promise<number> {
  const before = cutoff(now, PENDING_EXPIRY_DAYS);
  const updatedAt = now.toISOString();
  let expired = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const snap = await db
      .collectionGroup('pendingExpenses')
      .where('status', '==', 'pending')
      .where('receivedAt', '<', before)
      .orderBy('receivedAt')
      .limit(PAGE_SIZE)
      .get();
    const docs = snap.docs.filter((d) => isUserDoc(d.ref));
    if (docs.length === 0) break;
    const batch = db.batch();
    for (const d of docs) batch.update(d.ref, { status: 'expired', updatedAt });
    await batch.commit();
    expired += docs.length;
    if (snap.size < PAGE_SIZE) break;
  }
  return expired;
}

// ── C3 · Delete a user's data ─────────────────────────────────────────────

/**
 * Everything under users/{uid}: the profile doc and every subcollection
 * (settings, categories, expenses, checkIns, streak, wallet, coinLedger,
 * pendingExpenses, dailyRollups, monthlyRollups, rollupApplied, groupIndex,
 * devices — recursiveDelete also catches any added later), plus the Storage
 * prefix users/{uid}/ (category logos, receipts). Idempotent.
 */
export async function deleteUserSubtree(
  db: admin.firestore.Firestore,
  bucket: { deleteFiles(options: { prefix: string; force?: boolean }): Promise<unknown> },
  uid: string,
): Promise<void> {
  if (!uid || uid.includes('/')) throw new Error(`Refusing to delete data for uid "${uid}"`);
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
}

/**
 * The callable's checks. The uid to delete is the caller's own; a request
 * naming any other uid is refused rather than silently ignored, so a client
 * bug can't look like it deleted someone else.
 */
export function uidToDelete(auth: { uid: string } | undefined, data: unknown): string {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to delete your data.');
  const requested =
    typeof data === 'object' && data !== null && 'uid' in data ? (data as { uid: unknown }).uid : undefined;
  if (requested !== undefined && requested !== auth.uid) {
    throw new HttpsError('permission-denied', 'You can only delete your own data.');
  }
  return auth.uid;
}
