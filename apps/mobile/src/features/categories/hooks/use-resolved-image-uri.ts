/**
 * Turns a `CategoryIcon.path` into something `<Image>` can actually load.
 *
 * A freshly-picked logo is stored with its local `file://` path so it renders
 * before any upload happens — see docs/04-categories.md#uploaded-logos and the
 * optimistic write in `category-editor-screen.tsx`. Once the background upload
 * lands, the document is updated to the real Storage bucket path (deliberately
 * NOT a download URL — see docs/11-firebase.md — so it never embeds a token
 * that can expire), which this hook resolves at render time instead.
 *
 * Resolved URLs are cached in memory for the life of the app: a Storage path
 * is immutable once uploaded, so there is nothing to invalidate.
 */

import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from '@react-native-firebase/storage';

import { firebase } from '@/core/firebase/client';

const cache = new Map<string, string>();

export function useResolvedImageUri(path: string): string | null {
  const [uri, setUri] = useState<string | null>(() => resolveSync(path));

  useEffect(() => {
    const cached = resolveSync(path);
    if (cached) {
      setUri(cached);
      return;
    }
    setUri(null);
    let cancelled = false;
    const { storage } = firebase();
    getDownloadURL(ref(storage, path))
      .then((url) => {
        cache.set(path, url);
        if (!cancelled) setUri(url);
      })
      .catch(() => {
        // A path that hasn't finished uploading yet, or genuinely failed — the
        // caller falls back to the category's glyph while this stays null.
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return uri;
}

function resolveSync(path: string): string | null {
  // A local file is already a URI — no Storage round trip needed.
  if (path.startsWith('file://') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return cache.get(path) ?? null;
}
