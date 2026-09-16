/**
 * The session's own data: the profile document and the one-time seed of the
 * essential categories. Lives in core rather than a feature because the
 * bootstrap gate — which core owns — cannot render anything without it.
 */

import {
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
} from '@react-native-firebase/firestore';
import {
  type UserProfile,
  categoryToDoc,
  essentialCategoriesToSeed,
  firestorePaths,
  newProfile,
  parseProfile,
  profileToDoc,
} from '@loop/shared';

import { firebase } from './client';

export interface SessionHandlers {
  readonly onProfile: (profile: UserProfile) => void;
  /**
   * The local cache has no profile and the server has not answered yet. On a
   * normal first launch this lasts a moment; offline it lasts until reconnection.
   */
  readonly onWaitingForServer: () => void;
  readonly onError: (error: Error) => void;
}

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

async function seedEssentials(uid: string): Promise<void> {
  const { db } = firebase();
  const now = new Date().toISOString();
  const batch = writeBatch(db);

  for (const category of essentialCategoriesToSeed(null, now)) {
    batch.set(doc(db, firestorePaths.category(uid, category.id)), categoryToDoc(category, now));
  }
  // Same batch as the categories: the marker can never say "seeded" while the
  // categories themselves failed to write, or the reverse.
  batch.update(doc(db, firestorePaths.user(uid)), { categoriesSeededAt: now, updatedAt: now });

  await batch.commit();
}

/**
 * Watches the profile, creating it and seeding categories the first time.
 *
 * The profile is created only once the SERVER has confirmed it does not exist.
 * A cache miss alone proves nothing, and writing a fresh profile over a real one
 * would reset the account.
 */
export function observeSession(uid: string, isAnonymous: boolean, handlers: SessionHandlers): () => void {
  const { db } = firebase();
  const ref = doc(db, firestorePaths.user(uid));
  let creating = false;
  let seeding = false;

  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        if (snapshot.metadata.fromCache) {
          handlers.onWaitingForServer();
          return;
        }
        if (!creating) {
          creating = true;
          const profile = newProfile(uid, isAnonymous, new Date().toISOString());
          setDoc(ref, profileToDoc(profile)).catch((error: unknown) => {
            creating = false;
            handlers.onError(toError(error));
          });
        }
        return;
      }

      let profile: UserProfile;
      try {
        profile = parseProfile(uid, isAnonymous, snapshot.data());
      } catch (error) {
        handlers.onError(toError(error));
        return;
      }

      // Offline, the batch stays pending, but the local snapshot already shows the
      // marker as set, so this cannot fire twice.
      if (profile.categoriesSeededAt === null && !seeding) {
        seeding = true;
        seedEssentials(uid).catch((error: unknown) => {
          seeding = false;
          handlers.onError(toError(error));
        });
      }

      handlers.onProfile(profile);
    },
    (error) => handlers.onError(toError(error)),
  );
}
