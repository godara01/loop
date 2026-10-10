import { colors, radius, space, type, palette } from '@loop/shared';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';
import { getOtpResendCountdown, canResendOtp, OTP_RESEND_COOLDOWN } from './model/account.model';

export type OTPSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onVerify: (code: string) => void;
  onResend: () => void;
  resendToken?: number;
};

export function OTPSheet({
  visible,
  onDismiss,
  onVerify,
  onResend,
  resendToken,
}: OTPSheetProps) {
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (resendToken === undefined) {
      setCountdown(0);
      return;
    }
    setCountdown(getOtpResendCountdown(resendToken));
    const interval = setInterval(() => {
      const next = getOtpResendCountdown(resendToken);
      setCountdown(next);
      if (next === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendToken]);

  const handleVerify = () => {
    if (code.length !== 6) {
      haptic('warning');
      return;
    }
    haptic('tap');
    onVerify(code);
  };

  const handleResend = () => {
    if (!canResendOtp(resendToken ?? 0)) return;
    haptic('tap');
    setCode('');
    onResend();
  };

  if (!visible) return null;

  const resendDisabled = countdown > 0 || !canResendOtp(resendToken ?? 0);

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>Enter verification code</Text>
        <Text style={styles.body}>Six digits, sent by SMS.</Text>
        <TextInput
          testID="account-otp-input"
          accessibilityLabel="Verification code"
          placeholder="______"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
          style={styles.input}
        />
        <View style={styles.buttonGroup}>
          <TactileButton
            testID="account-otp-resend"
            label={countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
            variant="secondary"
            disabled={resendDisabled}
            fullWidth
            onPress={handleResend}
          />
          <TactileButton
            testID="account-otp-verify"
            label="Verify"
            variant="primary"
            disabled={code.length !== 6}
            fullWidth
            onPress={handleVerify}
          />
        </View>
        <TactileButton
          testID="account-otp-cancel"
          label="Cancel"
          variant="secondary"
          fullWidth
          onPress={() => {
            haptic('tap');
            setCode('');
            onDismiss();
          }}
        />
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
  input: {
    ...type.monoLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
    textAlign: 'center',
    letterSpacing: 8,
  },
  buttonGroup: {
    gap: space.md,
  },
});
