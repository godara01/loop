/**
 * Orbit's way into the inbox. Hidden when nothing is waiting, so an empty inbox
 * costs Orbit no space. The count comes only from `badgeCount`.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, palette, radius, space, type } from '@loop/shared';
import { router } from 'expo-router';
import { Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';

import { usePendingExpenses } from '../hooks/use-pending-expenses';
import { badgeCount } from '../model/inbox-view';

export function InboxBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const pending = usePendingExpenses();
  const count = pending.status === 'ready' ? badgeCount(pending.snapshot.items) : 0;
  if (count === 0) return null;

  return (
    <Pressable
      testID="orbit-inbox-badge"
      accessibilityRole="button"
      accessibilityLabel={`${count} ${count === 1 ? 'transaction' : 'transactions'} to approve`}
      hitSlop={8}
      onPress={() => {
        haptic('tap');
        router.push('/inbox');
      }}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed, style]}>
      <Ionicons name="mail-unread-outline" size={16} color={palette.onAccent} />
      <Text style={styles.count} testID="orbit-inbox-badge-count">
        {count > 99 ? '99+' : String(count)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.credit,
    backgroundColor: colors.credit,
    boxShadow: `0px 4px 0px 0px ${palette.limeShadow}`,
  },
  // The arcade press: the plate collapses and the badge drops 3px.
  pressed: { transform: [{ translateY: 3 }], boxShadow: `0px 1px 0px 0px ${palette.limeShadow}` },
  // Text on lime is always Deep Void.
  count: { ...type.monoMd, color: palette.onAccent },
});
