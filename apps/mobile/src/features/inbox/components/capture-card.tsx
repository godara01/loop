/**
 * The one-time Orbit card: after the third hand-typed expense, offer to read
 * bank messages. Shown once — it marks itself shown on first display, and
 * disappears for good on Not now, deny or grant.
 */

import { colors, space, type } from '@loop/shared';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useRecentExpenses } from '@/features/expenses';
import { haptic } from '@/lib/haptics';

import { useSmsCapture, useSmsCaptureRunner } from '../hooks/use-sms-capture';
import { CAPTURE_EXPLAINER, shouldShowCapturePrompt } from '../model/capture-prompt';

export function CaptureCard({ style }: { style?: object }) {
  useSmsCaptureRunner();
  const capture = useSmsCapture();
  const recent = useRecentExpenses(20);
  const manualCount = useMemo(
    () => (recent.status === 'ready' ? recent.snapshot.expenses.filter((e) => e.source === 'manual').length : 0),
    [recent],
  );
  const [visible, setVisible] = useState(false);

  const eligible = capture.supported && shouldShowCapturePrompt(manualCount, capture.state);
  useEffect(() => {
    if (!eligible || visible) return;
    setVisible(true);
    // Recorded as shown the moment it appears, so it can never come back.
    capture.dismissAs('shown');
  }, [eligible, visible, capture]);

  if (!visible || capture.state === 'granted' || capture.state === 'denied' || capture.state === 'dismissed') {
    return capture.error && capture.state === 'granted' ? (
      <Text testID="orbit-capture-error" style={[styles.error, style]}>
        {capture.error}
      </Text>
    ) : null;
  }

  return (
    <Card accent="social" style={[styles.card, style]}>
      <View testID="orbit-capture-card" style={styles.body}>
        <Text style={styles.title}>Let Loop catch bank messages?</Text>
        <Text style={styles.copy}>{CAPTURE_EXPLAINER}</Text>
        {capture.error ? <Text style={styles.error}>{capture.error}</Text> : null}
        <View style={styles.actions}>
          <TactileButton
            testID="orbit-capture-dismiss"
            label="Not now"
            variant="secondary"
            style={styles.action}
            onPress={() => {
              haptic('tap');
              capture.dismissAs('dismissed');
            }}
          />
          <TactileButton
            testID="orbit-capture-enable"
            label={capture.busy ? 'Reading…' : 'Turn on'}
            variant="social"
            disabled={capture.busy}
            style={styles.action}
            onPress={() => {
              void capture.enable();
            }}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {},
  body: { gap: space.md },
  title: { ...type.bodyLg, color: colors.text },
  copy: { ...type.bodyMd, color: colors.textMuted },
  error: { ...type.bodyMd, color: colors.debit },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
