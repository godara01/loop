/**
 * The v1.2 ledger migration (docs/27-full-ledger-plan.md § Migration script).
 * Run by `scripts/migrate-v2.ts` with the Admin SDK; kept here so the
 * Functions test harness exercises the exact code the script runs.
 *
 * Per user:
 *   1. `rebuildUserLedger` — rollups v2, account flows and markers, from the
 *      live transactions (the same code `rebuildRollups` uses).
 *   2. Seed the income categories when `categoriesSeedVersion < 2`.
 *   3. Write the server-only `meta/schema = { ledger: 2, migratedAt }`.
 *
 * Idempotent: a second run rebuilds to the same result, seeds nothing and
 * keeps the first `migratedAt`. Resumable: users are taken in document-id
 * order, so `fromUid` restarts where a run stopped.
 */

import type * as admin from 'firebase-admin';
import {
  type Category,
  DocumentShapeError,
  categoryToDoc,
  firestorePaths,
  incomeCategoriesToSeed,
  parseCategory,
} from '@loop/shared';

import { rebuildUserLedger } from './rollups';

export const LEDGER_VERSION = 2;
export const MIGRATION_BATCH_SIZE = 20;

export interface UserMigration {
  readonly uid: string;
  readonly expenses: number;
  readonly incomeCategoriesSeeded: number;
  /** False when `meta/schema` already said ledger ≥ 2 (a re-run). */
  readonly firstMigration: boolean;
}

export async function migrateUser(db: admin.firestore.Firestore, uid: string, now: string): Promise<UserMigration> {
  const { expenses } = await rebuildUserLedger(db, uid);

  const userRef = db.doc(firestorePaths.user(uid));
  const schemaRef = db.doc(firestorePaths.metaSchema(uid));

  return db.runTransaction(async (txn) => {
    const [profileSnap, categoriesSnap, schemaSnap] = await Promise.all([
      txn.get(userRef),
      txn.get(db.collection(firestorePaths.categories(uid))),
      txn.get(schemaRef),
    ]);

    const rawVersion = profileSnap.data()?.categoriesSeedVersion;
    const seedVersion = Number.isInteger(rawVersion) ? (rawVersion as number) : undefined;
    const existing: Category[] = [];
    for (const doc of categoriesSnap.docs) {
      try {
        existing.push(parseCategory(uid, doc.id, doc.data()));
      } catch (error) {
        // A malformed category still holds its slug; skip it rather than stop the run.
        if (!(error instanceof DocumentShapeError)) throw error;
      }
    }

    // Ids are derived from the slug, so a re-run never writes a second copy.
    const existingIds = new Set(categoriesSnap.docs.map((doc) => doc.id));
    const seeded = incomeCategoriesToSeed(seedVersion, existing, now);
    const seed = seeded.categories.filter((category) => !existingIds.has(category.id));
    for (const category of seed) {
      txn.set(db.doc(firestorePaths.category(uid, category.id)), categoryToDoc(category, now));
    }
    if (profileSnap.exists && seeded.newVersion !== (seedVersion ?? 1)) {
      txn.set(userRef, { categoriesSeedVersion: seeded.newVersion }, { merge: true });
    }

    const schema = schemaSnap.data();
    const alreadyMigrated = Number.isInteger(schema?.ledger) && (schema?.ledger as number) >= LEDGER_VERSION;
    if (!alreadyMigrated) {
      txn.set(schemaRef, { ledger: LEDGER_VERSION, migratedAt: now }, { merge: true });
    }

    return { uid, expenses, incomeCategoriesSeeded: seed.length, firstMigration: !alreadyMigrated };
  });
}

export interface MigrationRun {
  readonly users: readonly UserMigration[];
  /** The last uid processed; pass it as `fromUid` to resume after it. */
  readonly lastUid: string | null;
}

/**
 * Every user, in document-id order, `batchSize` at a time. `fromUid` resumes
 * AFTER that uid. `onBatch` reports progress (the script logs it).
 */
export async function migrateAllUsers(
  db: admin.firestore.Firestore,
  options: {
    readonly now: string;
    readonly fromUid?: string;
    readonly batchSize?: number;
    readonly onBatch?: (done: readonly UserMigration[]) => void;
  },
): Promise<MigrationRun> {
  const batchSize = options.batchSize ?? MIGRATION_BATCH_SIZE;
  const users: UserMigration[] = [];
  let cursor = options.fromUid ?? null;

  for (;;) {
    let page = db.collection('users').orderBy('__name__').limit(batchSize);
    if (cursor !== null) page = page.startAfter(cursor);
    const snapshot = await page.get();
    if (snapshot.empty) break;

    const done = await Promise.all(snapshot.docs.map((doc) => migrateUser(db, doc.id, options.now)));
    users.push(...done);
    options.onBatch?.(done);
    cursor = snapshot.docs[snapshot.docs.length - 1]!.id;
    if (snapshot.size < batchSize) break;
  }

  return { users, lastUid: cursor };
}
