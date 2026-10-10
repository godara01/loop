import { colors, fonts, space, type as typeScale } from '@loop/shared';
import { openURL } from 'expo-linking';
import { type ReactNode, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';

import { TactileButton } from '@/components/ui/tactile-button';
import { initRemoteConfig, minSupportedBuild, onRemoteConfigActivated } from '@/lib/remote-config';

import { isBuildSupported } from './model';

/**
 * The installed build number, or NaN when it can't be read. expo-application
 * is a native module: on a dev build made before it was added, importing it
 * throws, so it is required lazily and a missing module reads as NaN, which
 * isBuildSupported treats as supported (never block on unknown).
 */
function currentBuild(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application') as typeof import('expo-application');
    return parseInt(Application.nativeBuildVersion ?? '', 10);
  } catch {
    return NaN;
  }
}

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.getter.loop';

export function UpdateGate({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(true);

  const checkSupport = () => {
    const minBuild = minSupportedBuild();
    setSupported(isBuildSupported(currentBuild(), minBuild));
  };

  useEffect(() => {
    // Read the last activated value at once (works offline), then start
    // Remote Config: it fetches now and on every foreground (at most every
    // 15 minutes) and reports each activation back here.
    checkSupport();
    const unsubscribe = onRemoteConfigActivated(checkSupport);
    void initRemoteConfig();

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkSupport();
    });

    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, []);

  if (!supported) {
    return (
      <View style={styles.container} testID="update-gate">
        <View style={styles.content}>
          <Text style={styles.message}>
            This version of Loop is out of date. Update to keep your data in sync.
          </Text>
          <TactileButton
            testID="update-gate-update"
            label="Update"
            variant="primary"
            fullWidth
            onPress={() => openURL(PLAY_STORE_URL)}
          />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space['2xl'],
  },
  content: {
    width: '100%',
    maxWidth: 400,
    gap: space.xl,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.text,
    textAlign: 'center',
  },
});
