/**
 * Step 2 — Profile (Name & Currency). The only required step.
 * See docs/02-onboarding.md#step-2--profile.
 */

import { type CurrencyCode, DEFAULT_DISPLAY_NAME, colors, layout, space, type } from '@loop/shared';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { updateProfile } from '@/core/firebase/session-repository';
import { useSession } from '@/core/providers/bootstrap-provider';
import { haptic } from '@/lib/haptics';
import { useRecordOnboardingStep } from '../hooks/use-record-onboarding-step';

const CURRENCIES: readonly CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP', 'JPY'];

export function ProfileStepScreen() {
  useRecordOnboardingStep('profile');
  const insets = useSafeAreaInsets();
  const { uid, profile } = useSession();

  // Don't pre-fill the placeholder a new profile starts with.
  const [displayName, setDisplayName] = useState(
    profile.displayName && profile.displayName !== DEFAULT_DISPLAY_NAME ? profile.displayName : '',
  );
  const [currency, setCurrency] = useState<CurrencyCode>(profile.currency || 'INR');
  const [saving, setSaving] = useState(false);

  const canContinue = displayName.trim().length > 0;

  const handleContinue = async () => {
    if (!canContinue) {
      haptic('warning');
      return;
    }

    setSaving(true);
    try {
      // Not awaited: offline, a Firestore write resolves only on server ack
      // (docs/02 airplane-mode run). The local cache has it at once.
      updateProfile(uid, {
        displayName: displayName.trim(),
        currency,
      }).catch((err: unknown) => console.warn('Profile save error:', err));
      haptic('press');
      router.push('/onboarding/feel' as any);
    } catch (err) {
      console.warn('Profile save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Continue sits outside the ScrollView so it rides above the keyboard.
    // edgeToEdgeEnabled stops Android resizing the window for the keyboard, so
    // 'height' is needed there too (docs/03, the entry sheet's same fix).
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        testID="screen-onboarding-profile"
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: space.lg }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>STEP 1 OF 4</Text>
          <Text style={styles.title}>What should we call you?</Text>
          <Text style={styles.subtitle}>
            Used only on this device for greetings.
          </Text>
        </View>

        <Card style={styles.inputCard}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            testID="onboarding-name-input"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Alex"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            maxLength={40}
            autoFocus
          />
        </Card>

        <View style={styles.currencySection}>
          <Text style={styles.label}>CURRENCY</Text>
          <Text style={styles.hint}>You can't change this later without starting over.</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((code) => {
              const selected = currency === code;
              return (
                <Pressable
                  key={code}
                  testID={`onboarding-currency-${code}`}
                  accessibilityRole="radio"
                  accessibilityLabel={code}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptic('selection');
                    setCurrency(code);
                  }}
                  style={[styles.currencyChip, selected && styles.currencyChipSelected]}>
                  <Text
                    style={[
                      styles.currencyChipText,
                      selected && styles.currencyChipTextSelected,
                    ]}>
                    {code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
        <TactileButton
          testID="onboarding-profile-continue"
          label="Continue"
          fullWidth
          disabled={!canContinue || saving}
          onPress={handleContinue}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
    gap: space.lg,
  },
  header: {
    gap: space.xs,
  },
  eyebrow: {
    ...type.monoSm,
    color: colors.credit,
    letterSpacing: 1.5,
  },
  title: {
    ...type.headlineLg,
    color: colors.text,
  },
  subtitle: {
    ...type.bodyMd,
    color: colors.textMuted,
  },
  inputCard: {
    gap: space.xs,
  },
  label: {
    ...type.monoSm,
    color: colors.textMuted,
  },
  hint: {
    ...type.bodySm,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: space.sm,
  },
  textInput: {
    ...type.headlineSm,
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    paddingVertical: space.sm,
  },
  currencySection: {
    gap: space.xs,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  currencyChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
  },
  currencyChipSelected: {
    borderColor: colors.credit,
    backgroundColor: colors.credit,
  },
  currencyChipText: {
    ...type.monoMd,
    color: colors.text,
  },
  currencyChipTextSelected: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  footer: {
    paddingTop: space.md,
    paddingHorizontal: layout.screenMargin,
  },
});
