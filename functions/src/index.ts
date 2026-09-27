import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { cleanupSoftDeletedExpenses, deleteUserSubtree, expireStalePendingExpenses, uidToDelete } from './cleanup';
import { handleCategoryCreate, handleCheckInCreate, handleExpenseWrite } from './handlers';
import { rebuildUserRollups } from './rollups';

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

export const onExpenseWrite = onDocumentWritten('users/{uid}/expenses/{expenseId}', async (event) => {
  const uid = event.params.uid;
  const expenseId = event.params.expenseId;
  const beforeData = event.data?.before.exists ? (event.data.before.data() ?? null) : null;
  const afterData = event.data?.after.exists ? (event.data.after.data() ?? null) : null;
  await handleExpenseWrite(db, uid, expenseId, beforeData, afterData);
});

export const onCheckInCreate = onDocumentCreated('users/{uid}/checkIns/{localDate}', async (event) => {
  const uid = event.params.uid;
  const localDate = event.params.localDate;
  await handleCheckInCreate(db, uid, localDate);
});

export const onCategoryCreate = onDocumentCreated('users/{uid}/categories/{categoryId}', async (event) => {
  const uid = event.params.uid;
  const categoryId = event.params.categoryId;
  const data = event.data?.exists ? (event.data.data() ?? null) : null;
  if (data) {
    await handleCategoryCreate(db, uid, categoryId, data);
  }
});

/**
 * Admin/debug: regenerate the CALLER's rollups from their expenses. The uid
 * comes only from auth — never from the request data — so a user can rebuild
 * nobody's rollups but their own.
 */
export const rebuildRollups = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to rebuild rollups.');
  return rebuildUserRollups(db, request.auth.uid);
});

/** Daily: hard-delete expenses soft-deleted more than 90 days ago. */
export const cleanupSoftDeleted = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Kolkata' }, async () => {
  await cleanupSoftDeletedExpenses(db, new Date());
});

/** Daily: pending inbox items older than 30 days become `expired`. Never deleted. */
export const expirePendingExpenses = onSchedule({ schedule: 'every day 03:30', timeZone: 'Asia/Kolkata' }, async () => {
  await expireStalePendingExpenses(db, new Date());
});

/** Reset app / delete account: removes every document and file under the caller's uid. */
export const deleteUserData = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = uidToDelete(request.auth, request.data);
  await deleteUserSubtree(db, admin.storage().bucket(), uid);
  return { deleted: true };
});
