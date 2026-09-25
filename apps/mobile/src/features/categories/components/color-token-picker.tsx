import { CATEGORY_COLOR_TOKENS, type CategoryColorToken, categoryColors, colors, radius, space } from '@loop/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { haptic } from '@/lib/haptics';

export function ColorTokenPicker({
  selected,
  onSelect,
}: {
  selected: CategoryColorToken;
  onSelect: (token: CategoryColorToken) => void;
}) {
  return (
    <View style={styles.row}>
      {CATEGORY_COLOR_TOKENS.map((token) => {
        const active = token === selected;
        const { tint, onTint } = categoryColors[token];
        return (
          <Pressable
            key={token}
            testID={`color-${token}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={token}
            onPress={() => {
              if (active) return;
              haptic('selection');
              onSelect(token);
            }}
            style={[styles.swatch, { backgroundColor: tint }]}>
            {active ? <Ionicons name="checkmark" size={18} color={onTint} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
