import { colors, space, type, palette, radius } from '@loop/shared';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';
import { confirmSwitch } from './model/account.model';

export type SwitchSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onSwitch: () => void;
};

const CONFIRM_WORD = 'SWITCH';

export function SwitchSheet({ visible, onDismiss, onSwitch }: SwitchSheetProps) {
  const [step, setStep] = useState<'warn' | 'confirm'>('warn');
  const [typed, setTyped] = useState('');

  const reset = () => {
    setStep('warn');
    setTyped('');
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const handleContinue = () => {
    haptic('tap');
    setStep('confirm');
  };

  const handleSwitch = () => {
    if (typed !== CONFIRM_WORD) {
      haptic('warning');
      return;
    }
    haptic('destructive');
    reset();
    onSwitch();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        {step === 'warn' ? (
          <>
            <Text style={styles.title}>
              That Google account already has Loop data.
            </Text>
            <Text style={styles.body}>
              Switching will erase this device's data. Export it first if you want to keep it.
            </Text>
            <View style={styles.buttonGroup}>
              <TactileButton
                testID="account-switch-export"
                label="Export data"
                variant="secondary"
                onPress={() => {
                  haptic('tap');
                }}
              />
              <TactileButton
                testID="account-switch-continue"
                label="Switch to that account"
                variant="destructive"
                onPress={handleContinue}
              />
              <TactileButton
                testID="account-switch-cancel"
                label="Cancel"
                variant="secondary"
                onPress={handleDismiss}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Type SWITCH to confirm</Text>
            <Text style={styles.body}>
              This will permanently erase your current data on this device.
            </Text>
            <TextInput
              testID="account-switch-confirm-input"
              accessibilityLabel="Type SWITCH to confirm"
              value={typed}
              onChangeText={(t) => setTyped(t.toUpperCase())}
              placeholder="SWITCH"
              placeholderTextColor={palette.textMuted}
              autoCapitalize="characters"
              style={styles.input}
            />
            <View style={styles.buttonGroup}>
              <TactileButton
                testID="account-switch-button"
                label="Switch to that account"
                variant="destructive"
                disabled={typed !== CONFIRM_WORD}
                onPress={handleSwitch}
              />
              <TactileButton
                testID="account-switch-cancel"
                label="Cancel"
                variant="secondary"
                onPress={handleDismiss}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: space['2xl'],
    width: '100%',
    gap: space.md,
  },
  title: {
    ...type.headlineSm,
    color: colors.text,
  },
  body: {
    ...type.bodyMd,
    color: colors.textMuted,
  },
  buttonGroup: {
    gap: space.md,
    marginTop: space.sm,
  },
  input: {
    ...type.bodyLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
    textAlign: 'center',
    letterSpacing: 4,
  },
});