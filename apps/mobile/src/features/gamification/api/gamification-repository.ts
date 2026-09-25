/**
 * Server-authoritative gamification data: streak, wallet, check-ins, coin ledger.
 * See docs/06-gamification.md.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from '@react-native-firebase/firestore';
import {
  type CheckInDoc,
  type CoinLedgerEntryDoc,
  type StreakDoc,
  type WalletDoc,
  checkInToDoc,
  coinLedgerEntryToDoc,
  firestorePaths,
  parseCheckIn,
  parseCoinLedgerEntry,
  parseStreak,
  parseWallet,
} from '@loop/shared';

import { firebase } from '@/core/firebase/client';

// ============ STREAK ============

export interface StreakSnapshot {
  readonly streak: StreakDoc;
  readonly fromCache: boolean;
}

export function observeStreak(
  uid: string,
  onChange: (snapshot: StreakSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const { db } = firebase();

  return onSnapshot(
    doc(db, firestorePaths.streak(uid)),
    { includeMetadataChanges: true },
    (snapshot) => {
      onChange({
        streak: parseStreak(uid, snapshot.data()),
        fromCache: snapshot.metadata.fromCache,
      });
    },
    onError,
  );
}

// ============ WALLET ============

export interface WalletSnapshot {
  readonly wallet: WalletDoc;
  readonly fromCache: boolean;
}

export function observeWallet(
  uid: string,
  onChange: (snapshot: WalletSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const { db } = firebase();

  return onSnapshot(
    doc(db, firestorePaths.wallet(uid)),
    { includeMetadataChanges: true },
    (snapshot) => {
      onChange({
        wallet: parseWallet(uid, snapshot.data()),
        fromCache: snapshot.metadata.fromCache,
      });
    },
    onError,
  );
}

// ============ CHECK-INS ============

export interface CheckInSnapshot {
  readonly todayExists: boolean;
  readonly fromCache: boolean;
}

export function observeTodayCheckIn(
  uid: string,
  localDate: string,
  onChange: (snapshot: CheckInSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const { db } = firebase();

  return onSnapshot(
    doc(db, firestorePaths.checkIn(uid, localDate)),
    { includeMetadataChanges: true },
    (snapshot) => {
      onChange({
        todayExists: snapshot.exists(),
        fromCache: snapshot.metadata.fromCache,
      });
    },
    onError,
  );
}

export function saveCheckIn(uid: string, localDate: string): Promise<void> {
  const { db } = firebase();
  const docRef = doc(db, firestorePaths.checkIn(uid, localDate));
  const now = new Date().toISOString();
  return setDoc(docRef, checkInToDoc({ localDate }), { merge: false }); // Create-only
}

// ============ COIN LEDGER ============

export interface CoinLedgerSnapshot {
  readonly entries: readonly CoinLedgerEntryDoc[];
  readonly fromCache: boolean;
}

export function observeCoinLedger(
  uid: string,
  onChange: (snapshot: CoinLedgerSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const { db } = firebase();

  return onSnapshot(
    collection(db, firestorePaths.coinLedger(uid)),
    { includeMetadataChanges: true },
    (snapshot) => {
      const entries: CoinLedgerEntryDoc[] = [];
      for (const document of snapshot.docs) {
        try {
          entries.push(parseCoinLedgerEntry(uid, document.id, document.data()));
        } catch (error) {
          // Invalid entries are dropped, not fatal
          console.warn('Invalid coin ledger entry:', error);
        }
      }
      // Newest first
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onChange({
        entries,
        fromCache: snapshot.metadata.fromCache,
      });
    },
    onError,
  );
}
