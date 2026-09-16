import { categoryColors, colors, layout, space, type } from '@loop/shared';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag, Perforation } from '@/components/ui/surface';
import { firebase } from '@/core/firebase/client';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useSettings } from '@/core/providers/settings-provider';
import { useCategories } from '@/features/categories';
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
  const { settings, update: updateSettings } = useSettings();
  const { uid, profile } = useSession();
  const { projectId, usingEmulators } = firebase();
  const categories = useCategories();

  const syncTag =
    categories.status !== 'ready'
      ? null
      : categories.snapshot.hasPendingWrites
        ? ({ label: 'syncing', tone: 'social' } as const)
        : categories.snapshot.fromCache
          ? ({ label: 'offline', tone: 'muted' } as const)
          : ({ label: 'synced', tone: 'credit' } as const);

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
          <Text style={styles.title}>{profile.displayName}</Text>
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
            value={settings.hapticsEnabled}
            onValueChange={(next) => {
              updateSettings({ hapticsEnabled: next });
              // Apply synchronously as well: the provider's mirror runs after render,
              // and the confirmation below must fire against the new value.
              setHapticsEnabled(next);
              if (next) haptic('toggleOn');
            }}
            trackColor={{ false: colors.input, true: colors.credit }}
            thumbColor={colors.text}
          />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Account</Text>

      <Card>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.label}>Firebase</Text>
            <Text style={styles.hint}>project {projectId ?? 'unknown'}</Text>
          </View>
          <MonoTag tone={usingEmulators ? 'social' : 'credit'}>
            {usingEmulators ? 'emulator' : 'live'}
          </MonoTag>
        </View>
        <Perforation />
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.label}>You</Text>
            <Text style={styles.mono}>{uid.slice(0, 12)}…</Text>
          </View>
          <MonoTag>{profile.isAnonymous ? 'anonymous' : 'linked'}</MonoTag>
        </View>
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Categories</Text>
        {syncTag ? <MonoTag tone={syncTag.tone}>{syncTag.label}</MonoTag> : null}
      </View>

      <Card>
        {categories.status === 'loading' ? (
          <Text style={styles.hint}>Loading…</Text>
        ) : categories.status === 'error' ? (
          <Text style={styles.hint}>{categories.message}</Text>
        ) : (
          <>
            <View style={styles.tagWrap}>
              {categories.snapshot.categories
                .filter((category) => category.archivedAt === null)
                .map((category) => (
                  <MonoTag key={category.id} tint={categoryColors[category.colorToken].tint}>
                    {category.slug}
                  </MonoTag>
                ))}
            </View>
            <Text style={[styles.hint, styles.countLine]}>
              {categories.snapshot.categories.length} categories
              {categories.snapshot.invalid.length > 0
                ? ` · ${categories.snapshot.invalid.length} unreadable`
                : ''}
            </Text>
          </>
        )}
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
  mono: { ...type.monoMd, color: colors.textMuted },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  countLine: { marginTop: space.md },
});
