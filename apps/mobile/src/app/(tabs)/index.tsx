import { layout, space } from '@loop/shared';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitScreen } from '@/features/expenses';
import { InboxBadge } from '@/features/inbox';

export default function OrbitRoute() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <OrbitScreen />
      {/* Level with Orbit's "ORBIT / Today" title block. */}
      <InboxBadge style={[styles.badge, { top: insets.top + space.base + space.sm }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  badge: { position: 'absolute', right: layout.screenMargin },
});
