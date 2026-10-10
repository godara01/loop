import { colors, layout, space, type, palette, radius } from '@loop/shared';
import { router } from 'expo-router';
import React, { useState, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useAuth } from '@/core/providers/auth-provider';
import { firebase } from '@/core/firebase/client';
import { maskEmail, maskPhone } from '@/core/auth/mask';
import {
  linkWithProvider,
  signOutSafely,
  unlinkProvider,
  switchAccount,
  sendPhoneOtp,
  verifyPhoneOtp,
  linkPhoneCredential,
} from '@/core/auth/link-service';
import { linkErrorState } from '@/core/auth/link-errors';
import { OTPSheet } from './otp-sheet';
import { SwitchSheet } from './switch-sheet';

export const AccountScreen = () => {
  const { uid, profile } = useSession();
  const { state: authState } = useAuth();
  const insets = useSafeAreaInsets();
  const { auth } = firebase();

  const [isLinked, setIsLinked] = useState(!profile.isAnonymous);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);
  const [switchVisible, setSwitchVisible] = useState(false);
  const [pendingCredential, setPendingCredential] = useState<any>(null);
  const [phoneNumber, setPhoneNumber] = useState('+91');
  const [phoneEntry, setPhoneEntry] = useState(false);
  const [resendToken, setResendToken] = useState<number | undefined>(undefined);
  const [verificationId, setVerificationId] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  useEffect(() => {
    setIsLinked(!profile.isAnonymous);
    
    const updateProviderInfo = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const providerIds = currentUser.providerData.map(p => p.providerId);
          setLinkedProviders(providerIds);
        } else {
          setLinkedProviders([]);
        }
      } catch (error) {
        console.warn('Failed to get provider data:', error);
        setLinkedProviders([]);
      }
    };
    
    updateProviderInfo();
  }, [profile, authState]);

  const clearError = () => {
    setErrorMsg(null);
    setNeedsConnection(false);
  };

  const handleErrorCode = (code: string) => {
    if (code === 'auth/network-request-failed') {
      setNeedsConnection(true);
    }
    const state = linkErrorState(code);
    if (state.status === 'error') {
      setErrorMsg(state.message);
      if (state.action === 'switch') {
        setSwitchVisible(true);
      }
    }
    haptic('warning');
  };

  const handleGoogleLink = useCallback(async () => {
    clearError();
    setIsWorking(true);
    try {
      await linkWithProvider('google');
      haptic('splitConfirm');
    } catch (err: any) {
      handleErrorCode(err?.code ?? 'unknown');
    } finally {
      setIsWorking(false);
    }
  }, []);

  const handlePhoneLinkStart = useCallback(async () => {
    clearError();
    const norm = phoneNumber.trim();
    if (!norm) return;
    setIsWorking(true);
    try {
      const confirmation = await sendPhoneOtp(norm);
      setVerificationId(confirmation.verificationId ?? undefined);
      setResendToken(Date.now());
      setPhoneEntry(false);
      setOtpVisible(true);
    } catch (err: any) {
      handleErrorCode(err?.code ?? 'unknown');
    } finally {
      setIsWorking(false);
    }
  }, [phoneNumber]);

  const handleSignOut = useCallback(async () => {
    clearError();
    setIsWorking(true);
    try {
      await signOutSafely();
      haptic('destructive');
    } catch (err: any) {
      handleErrorCode(err?.code ?? 'unknown');
    } finally {
      setIsWorking(false);
    }
  }, []);

  const handleUnlink = useCallback(async () => {
    clearError();
    setIsWorking(true);
    try {
      await unlinkProvider('google');
    } catch (err: any) {
      handleErrorCode(err?.code ?? 'unknown');
    } finally {
      setIsWorking(false);
    }
  }, []);

  const handleOtpVerify = useCallback(
    async (code: string) => {
      clearError();
      try {
        if (authState.status === 'signed-in' && verificationId) {
          const credential = await verifyPhoneOtp(verificationId, code);
          await linkPhoneCredential(credential);
          haptic('splitConfirm');
          setOtpVisible(false);
          setVerificationId(undefined);
        } else {
          throw new Error('Not signed in or missing verification ID');
        }
      } catch (err: any) {
        handleErrorCode(err?.code ?? 'unknown');
      }
    },
    [authState.status, verificationId],
  );

  const handleOtpResend = useCallback(async () => {
    clearError();
    const norm = phoneNumber.trim();
    if (!norm) return;
    try {
      const confirmation = await sendPhoneOtp(norm);
      setVerificationId(confirmation.verificationId ?? undefined);
      setResendToken(Date.now());
      haptic('tap');
    } catch (err: any) {
      handleErrorCode(err?.code ?? 'unknown');
    }
  }, [phoneNumber]);

  const handleSwitchConfirmed = useCallback(async () => {
    setSwitchVisible(false);
    clearError();
    setIsWorking(true);
    try {
      await switchAccount('google');
      haptic('destructive');
    } catch (err: any) {
      handleErrorCode(err?.code ?? 'unknown');
    } finally {
      setIsWorking(false);
    }
  }, []);

  const buttonsDisabled = isWorking || needsConnection;

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
    const updateCurrentUser = async () => {
      try {
        const user = auth.currentUser;
        setCurrentUser(user);
      } catch (error) {
        console.warn('Failed to get current user:', error);
        setCurrentUser(null);
      }
    };
    
    updateCurrentUser();
    
    const subscriber = auth.onAuthStateChanged(updateCurrentUser);
    return () => subscriber();
  }, [auth]);

  return (
    <View
      testID="screen-account"
      style={[
        styles.screen,
        { paddingTop: insets.top + space['2xl'], paddingBottom: insets.bottom + space.xl },
      ]}>
      <Pressable
        testID="account-back"
        accessibilityLabel="Go back"
        accessibilityRole="button"
        onPress={() => {
          haptic('tap');
          router.back();
        }}
        style={styles.backButton}>
        <Text style={styles.backText}>← Account</Text>
      </Pressable>

      {!isLinked ? (
        <View style={styles.section}>
          <Text style={styles.headline}>Back up your data</Text>
          <Text style={styles.body}>
            Your data lives only on this device. Link an account to keep it safe.
          </Text>

          {needsConnection ? (
            <Text testID="account-needs-connection" style={styles.warning}>
              Needs a connection.
            </Text>
          ) : null}
          {errorMsg ? (
            <Text testID="account-error" style={styles.warning}>
              {errorMsg}
            </Text>
          ) : null}

          <View style={styles.buttonGroup}>
            <TactileButton
              testID="account-google-button"
              label="Continue with Google"
              variant="social"
              disabled={buttonsDisabled}
              fullWidth
              onPress={handleGoogleLink}
            />
            {!phoneEntry ? (
              <TactileButton
                testID="account-phone-button"
                label="Use phone number"
                variant="secondary"
                disabled={buttonsDisabled}
                fullWidth
                onPress={() => setPhoneEntry(true)}
              />
            ) : (
              <View style={styles.phoneRow}>
                <TextInput
                  testID="account-phone-input"
                  accessibilityLabel="Phone number"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  style={styles.phoneInput}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={palette.textMuted}
                />
                <TactileButton
                  testID="account-phone-send"
                  label="Send code"
                  variant="primary"
                  disabled={buttonsDisabled}
                  onPress={handlePhoneLinkStart}
                />
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.headline}>Your account</Text>

          <View style={styles.providerBlock}>
            {currentUser?.email ? (
              <View key="email" style={styles.providerRow}>
                <Text style={styles.providerTag}>EMAIL</Text>
                <Text style={styles.identity}>
                  {maskEmail(currentUser.email)}
                </Text>
              </View>
            ) : null}
            {currentUser?.phoneNumber ? (
              <View key="phone" style={styles.providerRow}>
                <Text style={styles.providerTag}>PHONE</Text>
                <Text style={styles.identity}>
                  {maskPhone(currentUser.phoneNumber)}
                </Text>
              </View>
            ) : null}
            {!currentUser?.email && !currentUser?.phoneNumber ? (
              <View key="unknown" style={styles.providerRow}>
                <Text style={styles.providerTag}>UNKNOWN</Text>
                <Text style={styles.identity}>No identifiers</Text>
              </View>
            ) : null}
          </View>

          {needsConnection ? (
            <Text testID="account-needs-connection" style={styles.warning}>
              Needs a connection.
            </Text>
          ) : null}
          {errorMsg ? (
            <Text testID="account-error" style={styles.warning}>
              {errorMsg}
            </Text>
          ) : null}

          <View style={styles.buttonGroup}>
            {linkedProviders.length >= 2 ? (
              <TactileButton
                testID="account-unlink-button"
                label="Unlink"
                variant="secondary"
                disabled={buttonsDisabled}
                fullWidth
                onPress={handleUnlink}
              />
            ) : null}
            <TactileButton
              testID="account-signout-button"
              label="Sign out"
              variant="destructive"
              disabled={buttonsDisabled}
              fullWidth
              onPress={handleSignOut}
            />
          </View>
        </View>
      )}

      <OTPSheet
        visible={otpVisible}
        onDismiss={() => setOtpVisible(false)}
        onVerify={handleOtpVerify}
        onResend={handleOtpResend}
        resendToken={resendToken}
      />

      <SwitchSheet
        visible={switchVisible}
        onDismiss={() => setSwitchVisible(false)}
        onSwitch={handleSwitchConfirmed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenMargin,
  },
  backButton: {
    marginBottom: space['2xl'],
  },
  backText: {
    ...type.bodyLg,
    color: colors.credit,
  },
  section: {
    gap: space.lg,
  },
  headline: {
    ...type.headlineSm,
    color: colors.text,
  },
  body: {
    ...type.bodyMd,
    color: colors.textMuted,
  },
  buttonGroup: {
    gap: space.md,
  },
  warning: {
    ...type.bodyMd,
    color: colors.debit,
  },
  providerBlock: {
    gap: space.sm,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  providerTag: {
    ...type.monoSm,
    color: colors.textMuted,
  },
  identity: {
    ...type.bodyMd,
    color: colors.text,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  phoneInput: {
    flex: 1,
    ...type.bodyLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
  },
});