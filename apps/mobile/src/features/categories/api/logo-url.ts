/**
 * Resolves a category logo's Storage path to a download URL. The Storage SDK
 * stays in api/ (docs/10 import rule 5); use-resolved-image-uri.ts caches it.
 */

import { getDownloadURL, ref } from '@react-native-firebase/storage';

import { firebase } from '@/core/firebase/client';

export function resolveLogoUrl(path: string): Promise<string> {
  return getDownloadURL(ref(firebase().storage, path));
}
