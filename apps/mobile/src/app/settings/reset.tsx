/**
 * You → Reset app. Types RESET, deletes the account's data on the server,
 * waits for that, then clears this device and starts again at onboarding.
 */

import { colors, layout, radius, space, type } from '@loop/shared';
import { reloadAppAsync } from 'expo';
import { router } from 'expo-router';
import { useReducer } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { deleteServerData, forgetThisDevice, isOfflineError } from '@/features/onboarding/api/reset';
import {
  INITIAL_RESET_STATE,
  RESET_CONFIRMATION,
  RESET_OFFLINE_MESSAGE,
  isResetConfirmed,
  resetReducer,
} from '@/features/onboarding/model/reset';
import { haptic } from '@/lib/haptics';

export default function ResetAppScreen() {
  const insets = useSafeAreaInsets();
  const [state, dispatch] = useReducer(resetReducer, INITIAL_RESET_STATE);

  const confirm = async () => {
    if (state.status !== 'confirming' || !isResetConfirmed(state.input)) return;
    haptic('error');
    dispatch({ type: 'confirm', online: true });
    try {
      await deleteServerData();
    } catch (error) {
      haptic('warning');
      dispatch({ type: 'failed', message: isOfflineError(error) ? RESET_OFFLINE_MESSAGE : 'Reset failed. Nothing was deleted from this device.' });
      return;
    }
    try {
      await forgetThisDevice();
    } catch {
      // Server data is already gone; a fresh start below still clears the rest.
    }
    dispatch({ type: 'succeeded' });
    router.replace('/onboarding');
    // A fresh JS runtime, so nothing holds the terminated Firestore instance.
    await reloadAppAsync('reset app');
  };

  const busy = state.status === 'deleting' || state.status === 'done';

  return (
    <ScrollView
      testID="screen-reset"
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.headerRow}>
        <Pressable testID="reset-back" accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} disabled={busy} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>RESET APP</Text>
      </View>
      <Text style={styles.title}>Start over</Text>

      <Card accent="debit" style={styles.card}>
        <Text style={styles.body}>
          This permanently deletes every expense, category, streak, coin and pending item on this account — on the server
          and on this phone. It can't be undone.
        </Text>
      </Card>

      {state.status === 'idle' ? (
        <TactileButton testID="reset-start" label="Reset app" variant="destructive" fullWidth onPress={() => { haptic('warning'); dispatch({ type: 'start' }); }} />
      ) : null}

      {state.status === 'confirming' ? (
        <View style={styles.confirm}>
          <Text style={styles.body}>Type {RESET_CONFIRMATION} to confirm.</Text>
          <TextInput
            testID="reset-input"
            accessibilityLabel={`Type ${RESET_CONFIRMATION} to confirm`}
            value={state.input}
            onChangeText={(input) => dispatch({ type: 'type', input })}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={RESET_CONFIRMATION}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TactileButton
            testID="reset-confirm"
            label="Delete everything"
            variant="destructive"
            fullWidth
            disabled={!isResetConfirmed(state.input)}
            onPress={confirm}
          />
          <TactileButton testID="reset-cancel" label="Cancel" variant="secondary" fullWidth onPress={() => dispatch({ type: 'cancel' })} />
        </View>
      ) : null}

      {state.status === 'deleting' || state.status === 'done' ? (
        <Text testID="reset-deleting" style={styles.body}>Deleting your data…</Text>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.confirm}>
          <Text testID="reset-error" style={styles.error}>{state.message}</Text>
          <TactileButton testID="reset-retry" label="Try again" variant="secondary" fullWidth onPress={() => dispatch({ type: 'start' })} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin, gap: space.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text },
  card: { gap: space.sm },
  body: { ...type.bodyLg, color: colors.text },
  confirm: { gap: space.md },
  input: {
    ...type.monoLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.debit,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.md,
  },
  error: { ...type.bodyLg, color: colors.debit },
});
