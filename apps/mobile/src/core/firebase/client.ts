/**
 * The one place Firebase is initialised. Only this folder and the `api` folder
 * inside each feature may import the Firebase SDK — see docs/10-architecture.md.
 */

import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from '@react-native-firebase/firestore';

import { firebaseEnv } from './config';

export type FirebaseAuth = ReturnType<typeof getAuth>;
export type FirestoreDb = ReturnType<typeof getFirestore>;

export interface FirebaseClients {
  readonly auth: FirebaseAuth;
  readonly db: FirestoreDb;
  readonly projectId: string | null;
  readonly usingEmulators: boolean;
}

/** Firestore's CACHE_SIZE_UNLIMITED. The cache IS the local store, so it must never evict. */
const UNLIMITED_CACHE = -1;

// Held on globalThis so Fast Refresh re-evaluating this module does not try to
// apply settings or emulator connections a second time; the native side rejects
// both once the instance is in use.
const holder = globalThis as typeof globalThis & { __loopFirebase?: FirebaseClients };

export function firebase(): FirebaseClients {
  if (holder.__loopFirebase) return holder.__loopFirebase;

  const app = getApp();

  let db: FirestoreDb;
  try {
    db = initializeFirestore(app, { persistence: true, cacheSizeBytes: UNLIMITED_CACHE });
  } catch (error) {
    // A full JS reload keeps the native instance, whose settings are already
    // applied. Reuse it; the settings it has are the ones set above.
    console.warn('[firebase] reusing configured Firestore instance', error);
    db = getFirestore(app);
  }
  const auth = getAuth(app);

  if (firebaseEnv.useEmulators) {
    try {
      connectFirestoreEmulator(db, firebaseEnv.emulatorHost, 8080);
      connectAuthEmulator(auth, `http://${firebaseEnv.emulatorHost}:9099`);
    } catch (error) {
      console.warn('[firebase] emulators already connected on this native instance', error);
    }
  }

  holder.__loopFirebase = {
    auth,
    db,
    projectId: app.options.projectId ?? null,
    usingEmulators: firebaseEnv.useEmulators,
  };
  return holder.__loopFirebase;
}
