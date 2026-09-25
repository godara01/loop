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

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();

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
});
