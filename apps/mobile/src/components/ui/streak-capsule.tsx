/**
 * Gamified streak counter. Monospaced so the number never shifts width as it
 * climbs, framed by a lime-to-coral gradient border per the design system.
 */

import { colors, palette, radius, space, type } from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';

export function StreakCapsule({ days, onPress }: { days: number; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${days} day streak`}
      onPress={() => {
        haptic('streakAdvance');
        onPress?.();
      }}>
      <View style={styles.frame}>
        <View style={styles.inner}>
          <Ionicons name="flash" size={14} color={colors.credit} />
          <Text style={styles.count}>{days}</Text>
          <Text style={styles.unit}>D</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A 1.5px "gradient" border faked with a tinted frame — swap for a Skia
  // gradient stroke when the arcade dashboard lands.
  frame: {
    borderRadius: radius.pill,
    padding: 1.5,
    backgroundColor: palette.limeDeep,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.nested,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  count: {
    ...type.monoLg,
    color: colors.text,
  },
  unit: {
    ...type.monoSm,
    color: colors.textMuted,
  },
});
