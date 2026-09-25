import { type Category, categoryColors, colors, radius, space, type } from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { haptic } from '@/lib/haptics';

/** One-tap category choice. Order comes from `orderForEntry`. */
export function CategoryStrip({
  categories,
  selectedId,
  onSelect,
  onAddNew,
}: {
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Opens the catalogue/create flow — docs/03-expenses.md#quick-add-behaviours. */
  onAddNew: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.strip}>
      {categories.map((category) => {
        const selected = category.id === selectedId;
        const { tint, onTint } = categoryColors[category.colorToken];
        return (
          <Pressable
            key={category.id}
            testID={`category-chip-${category.slug}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={category.name}
            onPress={() => {
              if (selected) return;
              haptic('selection');
              onSelect(category.id);
            }}
            style={[styles.chip, { borderColor: tint }, selected && { backgroundColor: tint }]}>
            <Text style={[styles.label, { color: selected ? onTint : tint }]}>{category.slug}</Text>
          </Pressable>
        );
      })}
      <Pressable
        testID="category-chip-add"
        accessibilityRole="button"
        accessibilityLabel="Add a category"
        onPress={() => {
          haptic('tap');
          onAddNew();
        }}
        style={[styles.chip, styles.addChip]}>
        <Ionicons name="add" size={16} color={colors.textMuted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.micro,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
  },
  label: { ...type.monoMd },
  addChip: {
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
});
