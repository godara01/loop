import type * as admin from 'firebase-admin';

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
