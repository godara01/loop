/**
 * Step 1 — Welcome. One sentence, one button.
 * See docs/02-onboarding.md#step-1--welcome.
 */

import { colors, layout, space, type } from '@loop/shared';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';
import { useRecordOnboardingStep } from '../hooks/use-record-onboarding-step';
import { linkService } from '@/core/auth/link-service';
import { linkErrorState, type LinkErrorState } from '@/core/auth/link-errors';

export function WelcomeScreen() {
  useRecordOnboardingStep('welcome');
  const insets = useSafeAreaInsets();
  const [linkError, setLinkError] = React.useState<LinkErrorState>({ status: 'idle' });
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleAlreadyUseLoop = async () => {
    setLinkError({ status: 'idle' });
    setIsSigningIn(true);
    try {
      // According to docs/16: "I already use Loop" flow (new device)
      // The signInWithProvider method handles:
      // 1. Getting a credential from the provider
      // 2. Deleting the anonymous user (throwaway uid) 
      // 3. Signing in with the credential
      await linkService.signInWithProvider('google');
      
      // Clear error state on success
      setLinkError({ status: 'idle' });
    } catch (error: any) {
      // Map Firebase error to our linkErrorState format
      if (error?.code) {
        setLinkError(linkErrorState(error.code));
      } else {
        setLinkError(linkErrorState('auth/unknown-error'));
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View
      testID="screen-onboarding-welcome"
      style={[
        styles.screen,
        { paddingTop: insets.top + space['2xl'], paddingBottom: insets.bottom + space.xl },
      ]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LOOP</Text>
        <Text style={styles.headline}>Track what you spend.{'\n'}Feel it land.</Text>
        <Text style={styles.body}>
          Arcade-tactile expense tracking and consistency streaks.
        </Text>
      </View>

      <View style={styles.footer}>
        <TactileButton
          testID="onboarding-start"
          label="Start"
          fullWidth
          onPress={() => {
            haptic('press');
            router.push('/onboarding/profile' as any);
          }}
        />
        {/* I already use Loop button - secondary action per docs/16 */}
        <View style={styles.secondaryButtonContainer}>
          <TactileButton
            testID="onboarding-already-use-loop"
            label="I already use Loop"
            variant="secondary"
            fullWidth
            disabled={isSigningIn || (linkError.status === 'error' && linkError.action === 'send-new')}
            onPress={handleAlreadyUseLoop}
          />
          {/* Simple error message display per docs/16 */}
          {linkError.status === 'error' && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{linkError.message}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
  },
  hero: {
    gap: space.md,
    marginTop: space['2xl'],
  },
  eyebrow: {
    ...type.monoSm,
    color: colors.credit,
    letterSpacing: 2,
  },
  headline: {
    ...type.displayLg,
    fontSize: 40,
    lineHeight: 46,
    color: colors.text,
  },
  body: {
    ...type.bodyLg,
    color: colors.textMuted,
  },
  footer: {
    width: '100%',
  },
  secondaryButtonContainer: {
    marginTop: space.md,
  },
   errorContainer: {
    marginTop: space.md,
    padding: space.md,
    backgroundColor: colors.card,
    borderRadius: 4,
  },
  errorText: {
    ...type.bodyMd,
    color: colors.text,
    marginBottom: space.sm,
  },
});
