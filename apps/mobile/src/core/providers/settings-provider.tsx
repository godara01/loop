/**
 * Live user settings, shared by every screen, and the bridge that keeps the
 * plain-module haptic layer in step with them.
 */

import { DEFAULT_SETTINGS, type UserSettings } from '@loop/shared';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

import { observeSettings, saveSettings } from '@/core/firebase/settings-repository';
import { setHapticsEnabled } from '@/lib/haptics';

import { useSession } from './bootstrap-provider';

interface SettingsContextValue {
  readonly settings: UserSettings;
  readonly update: (patch: Partial<UserSettings>) => void;
  /** The last read or write failure, if any. Shown by whichever screen owns the setting. */
  readonly error: string | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { uid } = useSession();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      observeSettings(
        uid,
        (next) => {
          setSettings(next);
          setError(null);
        },
        (failure) => setError(failure.message),
      ),
    [uid],
  );

  // haptics.ts is a plain module, not React state. Mirror the document into it so
  // a setting changed on another device, or restored from cache, takes effect.
  useEffect(() => {
    setHapticsEnabled(settings.hapticsEnabled);
  }, [settings.hapticsEnabled]);

  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(uid, next).catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : String(failure)),
    );
  };

  return <SettingsContext.Provider value={{ settings, update, error }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
