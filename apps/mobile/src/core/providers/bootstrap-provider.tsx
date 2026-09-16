/**
 * The gate between launch and the app. See docs/10-architecture.md#feature-bootstrap-sequence.
 *
 * Nothing below this provider renders until there is a signed-in user with a
 * profile, so every screen can call `useSession()` without handling "no user".
 * While that resolves, the splash stays up — for at most two seconds, after
 * which the gate says what it is waiting for instead of hanging silently.
 */

import { type UserProfile, colors, layout, space, type } from '@loop/shared';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TactileButton } from '@/components/ui/tactile-button';
import { observeSession } from '@/core/firebase/session-repository';

import { useAuth } from './auth-provider';

export interface Session {
  readonly uid: string;
  readonly profile: UserProfile;
}

type BootState =
  | { readonly status: 'loading'; readonly waitingForServer: boolean }
  | { readonly status: 'ready'; readonly session: Session }
  | { readonly status: 'needs-connection' }
  | { readonly status: 'failed'; readonly message: string };

const SPLASH_BUDGET_MS = 2000;

const SessionContext = createContext<Session | null>(null);

export function BootstrapProvider({
  children,
  onSettled,
}: {
  children: ReactNode;
  /** Called once the gate has something to show, so the splash can come down. */
  onSettled: () => void;
}) {
  const { state: auth, retry: retryAuth } = useAuth();
  const [boot, setBoot] = useState<BootState>({ status: 'loading', waitingForServer: false });
  const [overBudget, setOverBudget] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setOverBudget(true), SPLASH_BUDGET_MS);
    return () => clearTimeout(timer);
  }, []);

  const uid = auth.status === 'signed-in' ? auth.uid : null;
  const isAnonymous = auth.status === 'signed-in' ? auth.isAnonymous : true;

  useEffect(() => {
    if (auth.status === 'needs-connection') return setBoot({ status: 'needs-connection' });
    if (auth.status === 'failed') return setBoot({ status: 'failed', message: auth.message });
    if (uid === null) return setBoot({ status: 'loading', waitingForServer: false });

    return observeSession(uid, isAnonymous, {
      onProfile: (profile) => setBoot({ status: 'ready', session: { uid, profile } }),
      onWaitingForServer: () => setBoot({ status: 'loading', waitingForServer: true }),
      onError: (error) => setBoot({ status: 'failed', message: error.message }),
    });
    // `auth` is narrowed through `uid` and `isAnonymous`; its message only matters on failure.
  }, [auth.status, uid, isAnonymous, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const settled = boot.status !== 'loading' || overBudget;
  useEffect(() => {
    if (settled) onSettled();
  }, [settled, onSettled]);

  const retry = () => {
    retryAuth();
    setAttempt((n) => n + 1);
  };

  if (boot.status === 'ready') {
    return <SessionContext.Provider value={boot.session}>{children}</SessionContext.Provider>;
  }
  if (boot.status === 'needs-connection' || (boot.status === 'loading' && boot.waitingForServer && overBudget)) {
    return (
      <Blocked
        title="Connect once to set up"
        body="Loop creates your private space the first time it opens. After that it works fully offline."
        onRetry={retry}
      />
    );
  }
  if (boot.status === 'failed') {
    return <Blocked title="Loop couldn't start" body={boot.message} onRetry={retry} />;
  }
  // Still inside the splash budget: render nothing, the splash is covering this.
  return overBudget ? <View style={styles.screen}><Text style={styles.eyebrow}>CONNECTING…</Text></View> : null;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used below <BootstrapProvider>');
  return session;
}

function Blocked({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>LOOP</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <TactileButton label="Try again" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
    gap: space.md,
  },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text },
  body: { ...type.bodyLg, color: colors.textMuted },
  button: { marginTop: space.lg },
});
