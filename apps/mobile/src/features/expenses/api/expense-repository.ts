/**
 * Expense reads and writes. Screens get domain `Expense` objects and sync state,
 * never snapshots. See docs/10-architecture.md#the-repository-pattern.
 *
 * Writes are not awaited by the UI: Firestore applies them to the local cache
 * at once, so a saved expense appears instantly, online or not. The returned
 * promise settles when the server accepts it, which is when a rules rejection
 * would surface.
 */

import {
  type QueryDocumentSnapshot,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
} from '@react-native-firebase/firestore';
import { DocumentShapeError, type Expense, expenseToDoc, firestorePaths, parseExpense } from '@loop/shared';

import { firebase } from '@/core/firebase/client';

import { type Page } from '../model/filter-scan';

export interface ExpensesSnapshot {
  readonly expenses: readonly Expense[];
  readonly invalid: readonly DocumentShapeError[];
  readonly fromCache: boolean;
  /** Ids with local changes the server has not acknowledged yet. */
  readonly pendingIds: ReadonlySet<string>;
}

type Unsubscribe = () => void;
type OnError = (error: Error) => void;

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/** A new Firestore id, generated locally — works offline. */
export function newExpenseId(uid: string): string {
  const { db } = firebase();
  return doc(collection(db, firestorePaths.expenses(uid))).id;
}

export function saveExpense(uid: string, expense: Expense): Promise<void> {
  const { db } = firebase();
  return setDoc(doc(db, firestorePaths.expense(uid, expense.id)), expenseToDoc(expense));
}

function toSnapshot(
  uid: string,
  docs: ReadonlyArray<{ id: string; data: () => unknown; metadata: { hasPendingWrites: boolean } }>,
  fromCache: boolean,
): ExpensesSnapshot {
  const expenses: Expense[] = [];
  const invalid: DocumentShapeError[] = [];
  const pendingIds = new Set<string>();
  for (const document of docs) {
    try {
      expenses.push(parseExpense(uid, document.id, document.data()));
      if (document.metadata.hasPendingWrites) pendingIds.add(document.id);
    } catch (error) {
      if (!(error instanceof DocumentShapeError)) throw error;
      invalid.push(error);
    }
  }
  return { expenses, invalid, fromCache, pendingIds };
}

/**
 * Every live expense, once — the ledger's source without paging, for export.
 * Soft-deleted rows are left out by the query; pending SMS items live in
 * another collection and are never included. Malformed docs are skipped.
 */
export async function fetchLiveExpenses(uid: string): Promise<Expense[]> {
  const { db } = firebase();
  const snapshot = await getDocs(query(collection(db, firestorePaths.expenses(uid)), where('deletedAt', '==', null)));
  return toSnapshot(uid, snapshot.docs, snapshot.metadata.fromCache).expenses.slice();
}

/** Newest first, live. The ledger pages by raising `pageSize`. */
export function observeRecentExpenses(
  uid: string,
  pageSize: number,
  onChange: (snapshot: ExpensesSnapshot) => void,
  onError: OnError,
): Unsubscribe {
  const { db } = firebase();
  const q = query(
    collection(db, firestorePaths.expenses(uid)),
    where('deletedAt', '==', null),
    orderBy('occurredAt', 'desc'),
    limit(pageSize),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => onChange(toSnapshot(uid, snapshot.docs, snapshot.metadata.fromCache)),
    (error) => onError(toError(error)),
  );
}

/** The resume point of a paged read: the last document of the page before. */
export type ExpenseCursor = QueryDocumentSnapshot;

/**
 * One page of live expenses, newest first — the paged filter scan's source
 * (docs/03-expenses.md § "Ledger filters" → Query strategy). A one-shot read,
 * not a listener: a scan walks back through hundreds of rows, and keeping a
 * listener per page would hold them all open. Malformed docs are skipped.
 */
export async function fetchExpensesPage(
  uid: string,
  pageSize: number,
  after: ExpenseCursor | null,
): Promise<Page<ExpenseCursor>> {
  const { db } = firebase();
  const q = query(
    collection(db, firestorePaths.expenses(uid)),
    where('deletedAt', '==', null),
    orderBy('occurredAt', 'desc'),
    ...(after === null ? [] : [startAfter(after)]),
    limit(pageSize),
  );
  const snapshot = await getDocs(q);
  const items = toSnapshot(uid, snapshot.docs, snapshot.metadata.fromCache).expenses;
  const last = snapshot.docs.at(-1);
  // Short of a full page means the collection ended, so there is nothing to resume from.
  const next = last === undefined || snapshot.docs.length < pageSize ? null : last;
  return { items, next };
}

/** Every live expense on or after a local date — today's total, recent category usage. */
export function observeExpensesSince(
  uid: string,
  sinceLocalDate: string,
  onChange: (snapshot: ExpensesSnapshot) => void,
  onError: OnError,
): Unsubscribe {
  const { db } = firebase();
  const q = query(
    collection(db, firestorePaths.expenses(uid)),
    where('deletedAt', '==', null),
    where('localDate', '>=', sinceLocalDate),
    orderBy('localDate', 'desc'),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => onChange(toSnapshot(uid, snapshot.docs, snapshot.metadata.fromCache)),
    (error) => onError(toError(error)),
  );
}

/** A bounded local-date window for Insights and day detail. */
export function observeExpensesInRange(
  uid: string,
  startLocalDate: string,
  endLocalDate: string,
  onChange: (snapshot: ExpensesSnapshot) => void,
  onError: OnError,
): Unsubscribe {
  const { db } = firebase();
  const q = query(
    collection(db, firestorePaths.expenses(uid)),
    where('deletedAt', '==', null),
    where('localDate', '>=', startLocalDate),
    where('localDate', '<', endLocalDate),
    orderBy('localDate', 'desc'),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => onChange(toSnapshot(uid, snapshot.docs, snapshot.metadata.fromCache)),
    (error) => onError(toError(error)),
  );
}

/** One expense, including a soft-deleted one — the edit screen must still open it. */
export function observeExpense(
  uid: string,
  expenseId: string,
  onChange: (expense: Expense | null) => void,
  onError: OnError,
): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    doc(db, firestorePaths.expense(uid, expenseId)),
    (snapshot) => {
      if (!snapshot.exists()) return onChange(null);
      try {
        onChange(parseExpense(uid, snapshot.id, snapshot.data()));
      } catch (error) {
        onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );
}
