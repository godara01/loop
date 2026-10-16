/**
 * Reads and writes the user's accounts, and reads the Function-maintained
 * balances and markers the client needs for an exact offline balance
 * (docs/18-accounts.md § The balance). Screens get domain objects, never
 * snapshots. See docs/10-architecture.md#the-repository-pattern.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from '@react-native-firebase/firestore';
import {
  type Account,
  type AccountFlow,
  DocumentShapeError,
  accountToDoc,
  firestorePaths,
  parseAccount,
  parseAccountBalance,
  parseMarkerFlows,
} from '@loop/shared';

import { firebase } from '@/core/firebase/client';

export interface AccountsSnapshot {
  /** By `sortOrder`, then name. Archived accounts included; screens filter. */
  readonly accounts: readonly Account[];
  /** Documents that failed validation, reported rather than dropped silently. */
  readonly invalid: readonly DocumentShapeError[];
  readonly fromCache: boolean;
  readonly hasPendingWrites: boolean;
}

export interface AccountBalancesSnapshot {
  /** Server `flowMinor` by account id. An account with no doc yet has no entry (a zero flow). */
  readonly flows: ReadonlyMap<string, AccountFlow>;
  readonly invalid: readonly DocumentShapeError[];
  readonly fromCache: boolean;
  /** ISO instant of the last snapshot that came from the server; null until one has. */
  readonly serverAsOf: string | null;
}

type Unsubscribe = () => void;
type OnError = (error: Error) => void;

export function observeAccounts(uid: string, onChange: (snapshot: AccountsSnapshot) => void, onError: OnError): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    collection(db, firestorePaths.accounts(uid)),
    { includeMetadataChanges: true },
    (snapshot) => {
      const accounts: Account[] = [];
      const invalid: DocumentShapeError[] = [];
      for (const document of snapshot.docs) {
        try {
          accounts.push(parseAccount(uid, document.id, document.data()));
        } catch (error) {
          if (!(error instanceof DocumentShapeError)) throw error;
          invalid.push(error);
        }
      }
      accounts.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      onChange({ accounts, invalid, fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites });
    },
    onError,
  );
}

/** Live `accountBalances`. Owner-readable, written only by `onExpenseWrite`. */
export function observeAccountBalances(
  uid: string,
  onChange: (snapshot: AccountBalancesSnapshot) => void,
  onError: OnError,
): Unsubscribe {
  const { db } = firebase();
  let serverAsOf: string | null = null;
  return onSnapshot(
    collection(db, firestorePaths.accountBalances(uid)),
    { includeMetadataChanges: true },
    (snapshot) => {
      const flows = new Map<string, AccountFlow>();
      const invalid: DocumentShapeError[] = [];
      for (const document of snapshot.docs) {
        try {
          flows.set(document.id, parseAccountBalance(uid, document.id, document.data()));
        } catch (error) {
          if (!(error instanceof DocumentShapeError)) throw error;
          invalid.push(error);
        }
      }
      if (!snapshot.metadata.fromCache) serverAsOf = new Date().toISOString();
      onChange({ flows, invalid, fromCache: snapshot.metadata.fromCache, serverAsOf });
    },
    onError,
  );
}

/**
 * The account flows each `rollupApplied` marker last applied, for the
 * documents that still have pending writes. A missing marker (a document the
 * Function has never seen) applied nothing. Malformed markers count as none
 * rather than taking the balance down.
 */
export async function fetchMarkerFlows(
  uid: string,
  expenseIds: readonly string[],
): Promise<Readonly<Record<string, readonly AccountFlow[]>>> {
  const { db } = firebase();
  const entries = await Promise.all(
    expenseIds.map(async (expenseId) => {
      const snapshot = await getDoc(doc(db, firestorePaths.rollupApplied(uid, expenseId)));
      try {
        return [expenseId, parseMarkerFlows(uid, expenseId, snapshot.data())] as const;
      } catch (error) {
        if (!(error instanceof DocumentShapeError)) throw error;
        return [expenseId, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** A new Firestore id, generated locally — works offline. */
export function newAccountId(uid: string): string {
  const { db } = firebase();
  return doc(collection(db, firestorePaths.accounts(uid))).id;
}

export function saveAccount(uid: string, account: Account): Promise<void> {
  const { db } = firebase();
  return setDoc(doc(db, firestorePaths.account(uid, account.id)), accountToDoc(account, new Date().toISOString()));
}

/** One batch for the whole drag result, so a reorder is never seen half-applied. */
export function saveAccountOrder(uid: string, accounts: readonly Account[]): Promise<void> {
  const { db } = firebase();
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  for (const account of accounts) batch.set(doc(db, firestorePaths.account(uid, account.id)), accountToDoc(account, now));
  return batch.commit();
}

/** Archive is the normal way out: its transactions keep their `accountId` (docs/18 § Edge cases). */
export function archiveAccount(uid: string, accountId: string, archived: boolean): Promise<void> {
  const { db } = firebase();
  const now = new Date().toISOString();
  return updateDoc(doc(db, firestorePaths.account(uid, accountId)), { archivedAt: archived ? now : null, updatedAt: now });
}

/** Only offered for an account with zero transactions — rules can't count, so the screen checks. */
export function deleteAccount(uid: string, accountId: string): Promise<void> {
  const { db } = firebase();
  return deleteDoc(doc(db, firestorePaths.account(uid, accountId)));
}
