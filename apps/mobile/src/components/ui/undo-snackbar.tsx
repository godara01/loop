import { colors, layout, radius, space, type } from '@loop/shared';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UNDO_WINDOW_MS, useUndoStore } from '@/core/state/undo-store';
import { haptic } from '@/lib/haptics';

/** Floats above the dock. Mounted once, in the tabs layout. */
export function UndoSnackbar() {
  const insets = useSafeAreaInsets();
  const offer = useUndoStore((s) => s.offer);
  const dismiss = useUndoStore((s) => s.dismiss);

  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => dismiss(offer.id), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [offer, dismiss]);

  if (!offer) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + layout.thumbZoneOffset + 84 }]}>
      <View style={styles.bar} testID="snackbar">
        <Text style={styles.message} numberOfLines={1}>
          {offer.message}
        </Text>
        <Pressable
          testID="snackbar-undo"
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={12}
          onPress={() => {
            haptic('tap');
            offer.undo();
            dismiss(offer.id);
          }}>
          <Text style={styles.action}>UNDO</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: layout.screenMargin, right: layout.screenMargin },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: colors.chipActive,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.base,
  },
  message: { ...type.bodyMd, color: colors.text, flex: 1 },
  action: { ...type.monoMd, color: colors.credit },
});
