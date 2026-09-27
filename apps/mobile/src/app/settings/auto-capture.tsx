/**
 * You → Auto-capture. The explainer the permission prompt comes from.
 * See docs/12-sms-ingest.md#permissions-ux.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, layout, space, type } from '@loop/shared';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { CAPTURE_EXPLAINER } from '@/features/inbox/model/capture-prompt';
import { useSmsCapture } from '@/features/inbox/hooks/use-sms-capture';
import { haptic } from '@/lib/haptics';

export default function AutoCaptureScreen() {
  const insets = useSafeAreaInsets();
  const capture = useSmsCapture();

  const turnOn = async () => {
    haptic('press');
    const result = await capture.enable();
    haptic(result === 'granted' ? 'toggleOn' : 'warning');
  };

  return (
    <ScrollView
      testID="screen-auto-capture"
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.headerRow}>
        <Pressable testID="auto-capture-back" accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>AUTO-CAPTURE</Text>
      </View>
      <Text style={styles.title}>Bank messages, captured</Text>

      <Card style={styles.card}>
        <Text testID="auto-capture-explainer" style={styles.body}>
          {CAPTURE_EXPLAINER}
        </Text>
        <Text style={styles.hint}>
          Captured transactions wait in your inbox. Nothing counts toward your totals, streak or coins until you approve it.
        </Text>
      </Card>

      {!capture.supported ? (
        <Text testID="auto-capture-unsupported" style={styles.hint}>
          Auto-capture needs Android. On this phone you can still paste a bank message into the inbox.
        </Text>
      ) : capture.state === 'granted' ? (
        <View style={styles.status}>
          <MonoTag tone="credit">on</MonoTag>
          <Text testID="auto-capture-on" style={styles.body}>
            {capture.lastBackfill === null
              ? 'Loop is watching for bank messages.'
              : `Found ${capture.lastBackfill} ${capture.lastBackfill === 1 ? 'transaction' : 'transactions'} from the last 30 days — they're in your inbox.`}
          </Text>
          <Text style={styles.hint}>To stop, remove Loop's SMS permission in Android settings.</Text>
        </View>
      ) : (
        <View style={styles.status}>
          {capture.state === 'denied' ? (
            <Text testID="auto-capture-denied" style={styles.hint}>
              Permission wasn't granted. Everything else keeps working — you can turn this on any time.
            </Text>
          ) : null}
          <TactileButton
            testID="auto-capture-enable"
            label={capture.busy ? 'Reading your messages…' : 'Turn on auto-capture'}
            fullWidth
            disabled={capture.busy}
            onPress={turnOn}
          />
        </View>
      )}

      {capture.error ? (
        <Text testID="auto-capture-error" style={styles.error}>
          {capture.error}
        </Text>
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
  card: { gap: space.md },
  body: { ...type.bodyLg, color: colors.text },
  hint: { ...type.bodyMd, color: colors.textMuted },
  status: { gap: space.md },
  error: { ...type.bodyMd, color: colors.debit },
});
