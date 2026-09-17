/**
 * Live preview of how a category will render as a MonoTag, above the fields
 * that build it — updates as the user types. See docs/04-categories.md.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { type CategoryColorToken, type CategoryIcon, categoryColors, colors, radius, space, type } from '@loop/shared';
import { Image, StyleSheet, Text, View } from 'react-native';

export function CategoryTagPreview({
  name,
  slug,
  icon,
  colorToken,
}: {
  name: string;
  slug: string;
  icon: CategoryIcon;
  colorToken: CategoryColorToken;
}) {
  const { tint, onTint } = categoryColors[colorToken];
  const label = slug.trim() === '' ? 'TAG' : slug.trim().toUpperCase();

  return (
    <View style={styles.wrap}>
      <View style={[styles.tag, { backgroundColor: tint, borderColor: tint }]}>
        {icon.kind === 'image' ? (
          <Image source={{ uri: icon.path }} style={styles.logo} />
        ) : (
          <Ionicons name={icon.name as keyof typeof Ionicons.glyphMap} size={14} color={onTint} />
        )}
        <Text style={[styles.tagText, { color: onTint }]}>{label}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name.trim() === '' ? 'Category name' : name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1.5,
    borderRadius: radius.micro,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  logo: { width: 14, height: 14, borderRadius: 3 },
  tagText: { ...type.monoMd },
  name: { ...type.bodyMd, color: colors.textMuted },
});
