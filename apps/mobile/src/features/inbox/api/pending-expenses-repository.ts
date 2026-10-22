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
  type Expense,
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
  buildMergeApproval,
  buildRefundApproval,
  buildTransferApproval,
  planApprovalWrites,
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

/** Each approval — expense plus every pending it settles — lands together or not at all. */
function commitApprovals(uid: string, approvals: readonly Approval[]): Promise<void> {
  const { db } = firebase();
  const commits = planApprovalWrites(uid, approvals).map((ops) => {
    const batch = writeBatch(db);
    for (const write of ops) {
      if (write.op === 'set') batch.set(doc(db, write.path), write.data);
      else batch.update(doc(db, write.path), write.data);
    }
    return batch.commit();
  });
  return Promise.all(commits).then(() => undefined);
}

/**
 * Approve, or edit-and-approve when `edits` is given. Invalid input throws
 * synchronously, before anything is written; the promise is only the write.
 */
export function approvePendingExpense(
  uid: string,
  pending: PendingExpense,
  categoryId: string | undefined,
  edits?: ApprovalEdits,
): Promise<void> {
  const approval = buildApproval(uid, pending, categoryId, edits, new Date().toISOString());
  return commitApprovals(uid, [approval]);
}

/**
 * Throws `MissingCategoryError` before writing anything if any item lacks a
 * category (synchronously). Each item's pair is atomic; over 250 items span
 * several batches.
 */
export function approveAllPendingExpenses(
  uid: string,
  items: readonly PendingExpense[],
  choices: CategoryChoices,
): Promise<void> {
  const approvals = buildApproveAll(uid, items, choices, new Date().toISOString());
  return commitApprovals(uid, approvals);
}

/** "Yes" / a picked purchase on a refund card: a refund linked to `original`. */
export function approvePendingRefund(
  uid: string,
  pending: PendingExpense,
  original: Expense,
  refundsOfOriginal: readonly Expense[],
  accountId?: string | null,
): Promise<void> {
  return commitApprovals(uid, [buildRefundApproval(uid, pending, original, refundsOfOriginal, new Date().toISOString(), accountId)]);
}

/** A card-bill payment approved as a transfer from the chosen account to the card. */
export function approvePendingTransfer(uid: string, pending: PendingExpense, fromAccountId: string, toAccountId: string): Promise<void> {
  return commitApprovals(uid, [buildTransferApproval(uid, pending, fromAccountId, toAccountId, new Date().toISOString())]);
}

/** "Merge": one transfer, both pendings approved, one batch. */
export function mergePendingTransfer(
  uid: string,
  pair: { readonly debit: PendingExpense; readonly credit: PendingExpense },
  fromAccountId: string,
  toAccountId: string,
): Promise<void> {
  return commitApprovals(uid, [buildMergeApproval(uid, pair, fromAccountId, toAccountId, new Date().toISOString())]);
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
