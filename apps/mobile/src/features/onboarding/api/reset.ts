/**
 * Reset app: server data first, then this device. See TASKS.md X4 and the
 * pure model in ../model/reset.ts.
 *
 * Order matters. The callable must succeed BEFORE anything local is cleared:
 * if the device forgot first and the server call then failed, the account's
 * data would be orphaned with no way back to it from this phone.
 */

import { getApp } from '@react-native-firebase/app';
import { deleteUser, signOut } from '@react-native-firebase/auth';
import { clearPersistence, terminate } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { firebase } from '@/core/firebase/client';
import { firebaseEnv } from '@/core/firebase/config';

import { resetPlan } from '../model/reset';

let emulatorConnected = false;

function functions() {
  const instance = getFunctions(getApp());
  if (firebaseEnv.useEmulators && !emulatorConnected) {
    connectFunctionsEmulator(instance, firebaseEnv.emulatorHost, 5001);
    emulatorConnected = true;
  }
  return instance;
}

/** True for failures that mean "no connection", which the screen words differently. */
export function isOfflineError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return /unavailable|deadline-exceeded|network/i.test(`${code} ${message}`);
}

/** Step 1: delete every server document and file for this user. Throws on failure. */
export async function deleteServerData(): Promise<void> {
  await httpsCallable(functions(), 'deleteUserData')({});
}

/**
 * Step 2, only after step 1 succeeded: forget this device's copy, then the
 * account itself (anonymous) or the sign-in (linked).
 */
export async function forgetThisDevice(): Promise<void> {
  const { auth, db } = firebase();
  await terminate(db);
  await clearPersistence(db);
  const user = auth.currentUser;
  if (!user) return;
  if (resetPlan({ isAnonymous: user.isAnonymous }) === 'delete-user') await deleteUser(user);
  else await signOut(auth);
}
