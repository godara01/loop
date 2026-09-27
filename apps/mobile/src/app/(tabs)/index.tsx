import { layout, space } from '@loop/shared';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitScreen } from '@/features/expenses';
import { CaptureCard, InboxBadge } from '@/features/inbox';

/** Room for the floating tab dock under the capture card. */
const DOCK_CLEARANCE = 104;

export default function OrbitRoute() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <OrbitScreen />
      {/* Level with Orbit's "ORBIT / Today" title block. */}
      <InboxBadge style={[styles.badge, { top: insets.top + space.base + space.sm }]} />
      {/* One-time auto-capture offer (Android), above the dock; also runs the SMS listener. */}
      <CaptureCard style={[styles.captureCard, { bottom: insets.bottom + DOCK_CLEARANCE }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  badge: { position: 'absolute', right: layout.screenMargin },
  captureCard: { position: 'absolute', left: layout.screenMargin, right: layout.screenMargin },
});
