/**
 * Anonymous identity with no sign-up screen. See docs/11-firebase.md#auth-model.
 *
 * A returning user's session is restored from disk, offline. Only a brand-new
 * install has to reach the network, once, to be issued a uid — that is the single
 * moment Loop cannot work offline, and it is surfaced as its own state rather
 * than an endless spinner.
 */

import { onAuthStateChanged, signInAnonymously } from '@react-native-firebase/auth';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { firebase } from '@/core/firebase/client';

export type AuthState =
  | { readonly status: 'resolving' }
  | { readonly status: 'signed-in'; readonly uid: string; readonly isAnonymous: boolean }
  | { readonly status: 'needs-connection' }
  | { readonly status: 'failed'; readonly message: string };

interface AuthContextValue {
  readonly state: AuthState;
  readonly retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'resolving' });
  const [attempt, setAttempt] = useState(0);
  const signingIn = useRef(false);

  useEffect(() => {
    const { auth } = firebase();

    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setState({ status: 'signed-in', uid: user.uid, isAnonymous: user.isAnonymous });
        return;
      }
      if (signingIn.current) return;

      signingIn.current = true;
      setState({ status: 'resolving' });
      signInAnonymously(auth)
        .catch((error: unknown) => {
          const code = (error as { code?: string } | null)?.code;
          setState(
            code === 'auth/network-request-failed'
              ? { status: 'needs-connection' }
              : { status: 'failed', message: error instanceof Error ? error.message : String(error) },
          );
        })
        .finally(() => {
          signingIn.current = false;
        });
    });
    // `attempt` re-subscribes, which re-delivers the signed-out state and retries sign-in.
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return <AuthContext.Provider value={{ state, retry }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
