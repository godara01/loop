import {
  type CoinLedgerEntry,
  coinLedgerEntryToDoc,
  firestorePaths,
  walletToDoc,
} from '@loop/shared';

export async function awardCoins(
  db: FirebaseFirestore.Firestore,
  uid: string,
  entries: readonly CoinLedgerEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await db.runTransaction(async (transaction) => {
    // 1. Read all entry docs first to verify idempotency
    const entryRefs = entries.map((entry) => db.doc(firestorePaths.coinEntry(uid, entry.id)));
    const entrySnaps = await Promise.all(entryRefs.map((ref) => transaction.get(ref)));

    const entriesToAward: CoinLedgerEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (!entrySnaps[i].exists) {
        entriesToAward.push(entries[i]);
      }
    }

    if (entriesToAward.length === 0) return;

    // 2. Read wallet
    const walletRef = db.doc(firestorePaths.wallet(uid));
    const walletSnap = await transaction.get(walletRef);
    let currentBalance = 0;
    if (walletSnap.exists) {
      currentBalance = walletSnap.data()?.coinBalance ?? 0;
    }

    const additionalCoins = entriesToAward.reduce((sum, e) => sum + e.coins, 0);
    const newBalance = currentBalance + additionalCoins;

    // 3. Perform writes
    for (const entry of entriesToAward) {
      const ref = db.doc(firestorePaths.coinEntry(uid, entry.id));
      transaction.set(ref, coinLedgerEntryToDoc(entry));
    }
    transaction.set(walletRef, walletToDoc({ coinBalance: newBalance }), { merge: true });
  });
}
