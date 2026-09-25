import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';

import { handleCategoryCreate, handleCheckInCreate, handleExpenseWrite } from './handlers';

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
