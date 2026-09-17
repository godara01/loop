import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, space } from '@loop/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/haptics';

import { CATEGORY_GLYPHS } from '../model/glyphs';

export function GlyphGrid({ selected, onSelect }: { selected: string; onSelect: (glyph: string) => void }) {
  return (
    <View style={styles.grid}>
      {CATEGORY_GLYPHS.map((glyph) => {
        const active = glyph === selected;
        return (
          <Pressable
            key={glyph}
            testID={`glyph-${glyph}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={glyph}
            onPress={() => {
              if (active) return;
              haptic('selection');
              onSelect(glyph);
            }}
            style={[styles.cell, active && styles.cellActive]}>
            <Ionicons
              name={glyph as keyof typeof Ionicons.glyphMap}
              size={20}
              color={active ? colors.onAccent : colors.text}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.input,
  },
  cellActive: {
    backgroundColor: colors.credit,
    borderColor: colors.credit,
  },
});
