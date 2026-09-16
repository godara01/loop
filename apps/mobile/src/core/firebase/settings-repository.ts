/**
 * The user's preferences document, `users/{uid}/settings/app`.
 *
 * Firestore's offline cache is warm within the bootstrap gate, so settings are
 * read from here rather than mirrored into a second on-device store. That avoids
 * a new native dependency (and a rebuild) for no benefit yet; see docs/10.
 */

import { doc, onSnapshot, setDoc } from '@react-native-firebase/firestore';
import { type UserSettings, firestorePaths, parseSettings, settingsToDoc } from '@loop/shared';

import { firebase } from './client';

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/** A missing document is not an error: it means "all defaults". */
export function observeSettings(
  uid: string,
  onChange: (settings: UserSettings) => void,
  onError: (error: Error) => void,
): () => void {
  const { db } = firebase();
  return onSnapshot(
    doc(db, firestorePaths.settings(uid)),
    (snapshot) => {
      try {
        onChange(parseSettings(uid, snapshot.exists() ? snapshot.data() : undefined));
      } catch (error) {
        onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );
}

/**
 * Writes the whole document. The local cache applies it immediately, so the UI
 * never waits on this; offline, the promise settles once the write syncs.
 */
export function saveSettings(uid: string, settings: UserSettings): Promise<void> {
  const { db } = firebase();
  return setDoc(doc(db, firestorePaths.settings(uid)), settingsToDoc(settings, new Date().toISOString()));
}
