/**
 * Renders a `CategoryIcon` — resolving an uploaded logo's Storage path to a
 * fetchable URL, and falling back to its glyph while that resolves or if it
 * never does. Shared by every place a category's icon appears.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import type { CategoryIcon } from '@loop/shared';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { useResolvedImageUri } from '../hooks/use-resolved-image-uri';

export function CategoryIconView({
  icon,
  size,
  color,
  style,
}: {
  icon: CategoryIcon;
  size: number;
  color: string;
  style?: StyleProp<ImageStyle>;
}) {
  if (icon.kind === 'glyph') {
    return <Ionicons name={icon.name as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
  }
  return <ResolvedLogo icon={icon} size={size} color={color} style={style} />;
}

function ResolvedLogo({
  icon,
  size,
  color,
  style,
}: {
  icon: Extract<CategoryIcon, { kind: 'image' }>;
  size: number;
  color: string;
  style?: StyleProp<ImageStyle>;
}) {
  const uri = useResolvedImageUri(icon.path);
  if (!uri) {
    return <Ionicons name={icon.fallbackGlyph as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
  }
  return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: 3 }, style]} />;
}
