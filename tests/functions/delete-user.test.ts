import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import * as admin from 'firebase-admin';

import { deleteUserSubtree, uidToDelete } from '../../functions/src/cleanup';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9198';

const ALICE = 'user-delete-alice';
const BOB = 'user-delete-bob';

/** Every subcollection docs/11-firebase.md lists under users/{uid}. */
const SUBCOLLECTIONS = [
  'settings',
  'categories',
  'expenses',
  'checkIns',
  'streak',
  'wallet',
  'coinLedger',
  'pendingExpenses',
  'dailyRollups',
  'monthlyRollups',
  'rollupApplied',
  'groupIndex',
  'devices',
];

let db: admin.firestore.Firestore;
let bucket: ReturnType<admin.storage.Storage['bucket']>;

async function populate(uid: string): Promise<void> {
  await db.doc(`users/${uid}`).set({ displayName: uid });
  for (const col of SUBCOLLECTIONS) await db.doc(`users/${uid}/${col}/doc-1`).set({ x: 1 });
  await db.doc(`users/${uid}/expenses/doc-1/nested/deep`).set({ x: 1 });
  await bucket.file(`users/${uid}/categories/logo.png`).save(Buffer.from('png'), { contentType: 'image/png' });
  await bucket.file(`users/${uid}/receipts/r1.jpg`).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
}

async function counts(uid: string): Promise<{ docs: number; files: number }> {
  let docs = (await db.doc(`users/${uid}`).get()).exists ? 1 : 0;
  for (const col of SUBCOLLECTIONS) docs += (await db.collection(`users/${uid}/${col}`).get()).size;
  docs += (await db.collection(`users/${uid}/expenses/doc-1/nested`).get()).size;
  const [files] = await bucket.getFiles({ prefix: `users/${uid}/` });
  return { docs, files: files.length };
}

before(() => {
  const app =
    admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({ projectId: 'demo-loop', storageBucket: 'demo-loop.appspot.com' });
  db = app.firestore();
  bucket = app.storage().bucket('demo-loop.appspot.com');
});

beforeEach(async () => {
  for (const uid of [ALICE, BOB]) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
  }
});

describe('deleteUserData (C3)', () => {
  it('leaves a fully populated user with zero docs and zero files', async () => {
    await populate(ALICE);
    assert.deepEqual(await counts(ALICE), { docs: 1 + SUBCOLLECTIONS.length + 1, files: 2 });

    await deleteUserSubtree(db, bucket, ALICE);

    assert.deepEqual(await counts(ALICE), { docs: 0, files: 0 });
  });

  it("leaves a second user's data untouched", async () => {
    await populate(ALICE);
    await populate(BOB);
    const bobBefore = await counts(BOB);

    await deleteUserSubtree(db, bucket, ALICE);

    assert.deepEqual(await counts(BOB), bobBefore);
  });

  it('refuses a request for another uid, and an unauthenticated one', () => {
    assert.equal(uidToDelete({ uid: ALICE }, {}), ALICE);
    assert.equal(uidToDelete({ uid: ALICE }, { uid: ALICE }), ALICE);
    assert.throws(() => uidToDelete({ uid: ALICE }, { uid: BOB }), /permission-denied|own data/);
    assert.throws(() => uidToDelete(undefined, {}), /unauthenticated|Sign in/);
  });

  it('is a no-op the second time', async () => {
    await populate(ALICE);
    await deleteUserSubtree(db, bucket, ALICE);
    await deleteUserSubtree(db, bucket, ALICE);
    assert.deepEqual(await counts(ALICE), { docs: 0, files: 0 });
  });

  it('refuses an empty or path-like uid', async () => {
    await assert.rejects(deleteUserSubtree(db, bucket, ''));
    await assert.rejects(deleteUserSubtree(db, bucket, 'a/b'));
  });
});
