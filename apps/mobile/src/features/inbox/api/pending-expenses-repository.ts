/**
 * Pending-expense reads and writes. Screens get `PendingExpense` objects and
 * sync state, never snapshots. See docs/10-architecture.md#the-repository-pattern
 * and docs/12-sms-ingest.md#the-inbox.
 *
 * Like the expense repository, writes are not awaited by the UI: Firestore
 * applies them to the local cache at once, so the inbox works offline.
 *
 * No coin or streak logic lives here. An approved item becomes an ordinary
 * expense, and `onExpenseWrite` handles it like any other.
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';
import {
  DocumentShapeError,
  expenseToDoc,
  firestorePaths,
  parsePendingExpense,
  pendingExpenseToDoc,
} from '@loop/shared';

import { firebase } from '@/core/firebase/client';

import {
  type Approval,
  type ApprovalEdits,
  type CategoryChoices,
  type PendingExpense,
  buildApproval,
  buildApproveAll,
} from '../model/approval';

export interface PendingExpensesSnapshot {
  /** Status `pending`, received within the last 30 days, newest first. */
  readonly items: readonly PendingExpense[];
  readonly invalid: readonly DocumentShapeError[];
  readonly fromCache: boolean;
}

type Unsubscribe = () => void;
type OnError = (error: Error) => void;

/** Items older than this leave the inbox; C2's sweep later marks them `expired`. */
export const PENDING_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

/** A write batch holds at most 500 operations, and each approval is two. */
const APPROVALS_PER_BATCH = 250;

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/** A new Firestore id, generated locally — works offline. */
export function newPendingExpenseId(uid: string): string {
  const { db } = firebase();
  return doc(collection(db, firestorePaths.pendingExpenses(uid))).id;
}

export function createPendingExpense(uid: string, pending: PendingExpense): Promise<void> {
  const { db } = firebase();
  return setDoc(doc(db, firestorePaths.pendingExpense(uid, pending.id)), pendingExpenseToDoc(pending));
}

/**
 * The inbox, live. The age cut-off is applied here, client-side, so an item
 * drops out on time even before the server sweep has run.
 */
export function listenPendingExpenses(
  uid: string,
  onChange: (snapshot: PendingExpensesSnapshot) => void,
  onError: OnError,
  now: () => Date = () => new Date(),
): Unsubscribe {
  const { db } = firebase();
  // One equality filter needs no composite index; ordering is done here.
  const q = query(collection(db, firestorePaths.pendingExpenses(uid)), where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snapshot) => {
      const cutoff = now().getTime() - PENDING_MAX_AGE_DAYS * DAY_MS;
      const items: PendingExpense[] = [];
      const invalid: DocumentShapeError[] = [];
      for (const document of snapshot.docs) {
        try {
          const item = parsePendingExpense(uid, document.id, document.data());
          if (Date.parse(item.receivedAt) >= cutoff) items.push(item);
        } catch (error) {
          if (!(error instanceof DocumentShapeError)) throw error;
          invalid.push(error);
        }
      }
      items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
      onChange({ items, invalid, fromCache: snapshot.metadata.fromCache });
    },
    (error) => onError(toError(error)),
  );
}

/** The expense and the pending update land together or not at all. */
function commitApprovals(uid: string, approvals: readonly Approval[]): Promise<void> {
  const { db } = firebase();
  const commits: Promise<void>[] = [];
  for (let start = 0; start < approvals.length; start += APPROVALS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const { expense, pendingUpdate } of approvals.slice(start, start + APPROVALS_PER_BATCH)) {
      batch.set(doc(db, firestorePaths.expense(uid, expense.id)), expenseToDoc(expense));
      batch.update(doc(db, firestorePaths.pendingExpense(uid, expense.pendingId!)), { ...pendingUpdate });
    }
    commits.push(batch.commit());
  }
  return Promise.all(commits).then(() => undefined);
}

/** Approve, or edit-and-approve when `edits` is given. */
export async function approvePendingExpense(
  uid: string,
  pending: PendingExpense,
  categoryId: string | undefined,
  edits?: ApprovalEdits,
): Promise<void> {
  const approval = buildApproval(uid, pending, categoryId, edits, new Date().toISOString());
  await commitApprovals(uid, [approval]);
}

/**
 * Throws `MissingCategoryError` before writing anything if any item lacks a
 * category. Each item's pair is atomic; over 250 items span several batches.
 */
export async function approveAllPendingExpenses(
  uid: string,
  items: readonly PendingExpense[],
  choices: CategoryChoices,
): Promise<void> {
  const approvals = buildApproveAll(uid, items, choices, new Date().toISOString());
  await commitApprovals(uid, approvals);
}

/**
 * Marks the item `rejected`. Never deleted: rejections are the training signal
 * for post-MVP categorisation.
 */
export function dismissPendingExpense(uid: string, pendingExpenseId: string): Promise<void> {
  const { db } = firebase();
  return updateDoc(doc(db, firestorePaths.pendingExpense(uid, pendingExpenseId)), {
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  });
}
