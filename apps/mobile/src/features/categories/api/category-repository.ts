/**
 * Reads the user's categories. Screens never see a Firestore snapshot — they get
 * domain `Category` objects and the sync state. See docs/10-architecture.md.
 */

import { collection, onSnapshot } from '@react-native-firebase/firestore';
import { type Category, DocumentShapeError, firestorePaths, parseCategory } from '@loop/shared';

import { firebase } from '@/core/firebase/client';

export interface CategoriesSnapshot {
  readonly categories: readonly Category[];
  /**
   * Documents that failed validation. They are left out of `categories` rather
   * than taking the whole list down, and reported here rather than dropped
   * silently.
   */
  readonly invalid: readonly DocumentShapeError[];
  /** Served from the local cache — the device is offline or has not synced yet. */
  readonly fromCache: boolean;
  /** Local writes the server has not acknowledged yet. */
  readonly hasPendingWrites: boolean;
}

export function observeCategories(
  uid: string,
  onChange: (snapshot: CategoriesSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const { db } = firebase();

  return onSnapshot(
    collection(db, firestorePaths.categories(uid)),
    // Metadata changes too, so the sync indicator flips when a write lands.
    { includeMetadataChanges: true },
    (snapshot) => {
      const categories: Category[] = [];
      const invalid: DocumentShapeError[] = [];

      for (const document of snapshot.docs) {
        try {
          categories.push(parseCategory(uid, document.id, document.data()));
        } catch (error) {
          if (!(error instanceof DocumentShapeError)) throw error;
          invalid.push(error);
        }
      }

      categories.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
      onChange({
        categories,
        invalid,
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    onError,
  );
}
