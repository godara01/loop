/**
 * Step 3 — Feel. Explains the tactile philosophy of the app.
 * See docs/02-onboarding.md#step-3--feel.
 */

import { colors, layout, space, type } from '@loop/shared';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Perforation } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSettings } from '@/core/providers/settings-provider';
import { haptic, setHapticsEnabled } from '@/lib/haptics';

export function FeelStepScreen() {
  const insets = useSafeAreaInsets();
  const { settings, update: updateSettings } = useSettings();

  return (
    <ScrollView
      testID="screen-onboarding-feel"
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl },
      ]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>STEP 2 OF 4</Text>
        <Text style={styles.title}>Loop talks back.</Text>
        <Text style={styles.subtitle}>
          Every save, every streak, every mistake has its own physical response.
        </Text>
      </View>

      <Card style={styles.demoCard}>
        <Text style={styles.sectionLabel}>FEEL THE VOCABULARY</Text>
        <View style={styles.demoRow}>
          <View style={styles.demoInfo}>
            <Text style={styles.demoTitle}>Split confirm</Text>
            <Text style={styles.demoDesc}>Crisp, positive mechanical snap.</Text>
          </View>
          <TactileButton
            testID="onboarding-feel-demo-confirm"
            label="Try it"
            variant="secondary"
            onPress={() => haptic('splitConfirm')}
          />
        </View>

        <Perforation />

        <View style={styles.demoRow}>
          <View style={styles.demoInfo}>
            <Text style={styles.demoTitle}>Error warning</Text>
            <Text style={styles.demoDesc}>Blunt rejected pulse.</Text>
          </View>
          <TactileButton
            testID="onboarding-feel-demo-error"
            label="Try it"
            variant="secondary"
            onPress={() => haptic('error')}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Haptic feedback</Text>
            <Text style={styles.toggleDesc}>Keep physical feedback enabled.</Text>
          </View>
          <Switch
            testID="onboarding-haptics-switch"
            accessibilityLabel="Haptic feedback"
            value={settings.hapticsEnabled}
            onValueChange={(next) => {
              updateSettings({ hapticsEnabled: next });
              setHapticsEnabled(next);
              if (next) haptic('toggleOn');
            }}
            trackColor={{ false: colors.input, true: colors.credit }}
            thumbColor={colors.text}
          />
        </View>
      </Card>

      <View style={styles.footer}>
        <TactileButton
          testID="onboarding-feel-continue"
          label="Continue"
          fullWidth
          onPress={() => {
            haptic('press');
            router.push('/onboarding/categories' as any);
          }}
        />
        {/* Skipping leaves haptics at their default (on). docs/02-onboarding.md. */}
        <TactileButton
          testID="onboarding-feel-skip"
          label="Skip"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/onboarding/categories' as any)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
    gap: space.lg,
  },
  header: { gap: space.xs },
  eyebrow: { ...type.monoSm, color: colors.credit, letterSpacing: 1.5 },
  title: { ...type.headlineLg, color: colors.text },
  subtitle: { ...type.bodyMd, color: colors.textMuted },
  demoCard: { gap: space.md },
  sectionLabel: { ...type.monoSm, color: colors.textMuted },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  demoInfo: { flex: 1, gap: 2 },
  demoTitle: { ...type.bodyLg, color: colors.text },
  demoDesc: { ...type.bodySm, color: colors.textMuted },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  toggleInfo: { flex: 1, gap: 2 },
  toggleTitle: { ...type.bodyLg, color: colors.text },
  toggleDesc: { ...type.bodySm, color: colors.textMuted },
  footer: { marginTop: 'auto', paddingTop: space.md, gap: space.md },
});
