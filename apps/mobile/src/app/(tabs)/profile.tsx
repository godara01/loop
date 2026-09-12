import { colors, layout, space, type } from '@loop/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag, Perforation } from '@/components/ui/surface';
import { firebaseStatus } from '@/core/firebase/status';
import { StreakCapsule } from '@/components/ui/streak-capsule';
import { TactileButton } from '@/components/ui/tactile-button';
import { type HapticEvent, haptic, setHapticsEnabled } from '@/lib/haptics';

/** Every semantic event, so a real device can be audited in one pass. */
const EVENTS: HapticEvent[] = [
  'tap',
  'selection',
  'press',
  'dragStart',
  'dragTick',
  'dragDrop',
  'splitConfirm',
  'settleSuccess',
  'streakAdvance',
  'toggleOn',
  'toggleOff',
  'warning',
  'error',
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [hapticsOn, setHapticsOn] = useState(true);
  // Native modules cannot change at runtime, so this is read once.
  const [firebase] = useState(firebaseStatus);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.base, paddingBottom: 140 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOU</Text>
          <Text style={styles.title}>Sanket</Text>
        </View>
        <StreakCapsule days={12} />
      </View>

      <Card>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.label}>Haptic feedback</Text>
            <Text style={styles.hint}>
              Physical response on splits, settlements, and streaks.
            </Text>
          </View>
          <Switch
            value={hapticsOn}
            onValueChange={(next) => {
              setHapticsOn(next);
              setHapticsEnabled(next);
              // Fire after enabling so the user feels the confirmation.
              if (next) haptic('toggleOn');
            }}
            trackColor={{ false: colors.input, true: colors.credit }}
            thumbColor={colors.text}
          />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Build</Text>
      <Text style={styles.sectionHint}>
        The native Firebase SDK is only present in a development build. In Expo Go
        this reads NOT LINKED, and that is expected — see docs/13-build-plan.md.
      </Text>

      <Card>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.label}>Firebase</Text>
            <Text style={styles.hint}>
              {firebase.linked
                ? `project ${firebase.projectId ?? 'unknown'}`
                : 'native module not present in this binary'}
            </Text>
          </View>
          <MonoTag tone={firebase.linked ? 'credit' : 'debit'}>
            {firebase.linked ? 'linked' : 'not linked'}
          </MonoTag>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Haptic bench</Text>
      <Text style={styles.sectionHint}>
        Run these on a physical device. Android coverage varies by OEM — anything
        that feels flat here needs a different mapping in lib/haptics.ts.
      </Text>

      <Card>
        {EVENTS.map((event, index) => (
          <View key={event}>
            {index > 0 ? <Perforation /> : null}
            <View style={styles.row}>
              <Text style={styles.event}>{event}</Text>
              <TactileButton
                label="Feel"
                variant="secondary"
                onPress={() => haptic(event)}
                style={styles.testButton}
              />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin, gap: space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.xs,
  },
  info: { flex: 1, gap: 4 },
  label: { ...type.bodyLg, color: colors.text },
  hint: { ...type.bodySm, color: colors.textMuted },
  sectionTitle: { ...type.headlineSm, color: colors.text, marginTop: space.sm },
  sectionHint: { ...type.bodySm, color: colors.textMuted, marginBottom: space.xs },
  event: { ...type.monoMd, color: colors.text },
  testButton: { minWidth: 92 },
});
