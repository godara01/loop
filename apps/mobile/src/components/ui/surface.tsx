/**
 * Ledger surfaces. Structural containers with crisp 1.5px borders and 24px
 * corners — the "arcade receipt plate" the whole ledger is built from.
 */

import { colors, palette, radius, space, type } from '@loop/shared';
import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

interface CardProps {
  children: ReactNode;
  /** Draws the border in an accent color to mark priority. */
  accent?: 'none' | 'credit' | 'debit' | 'social';
  hero?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ACCENT_BORDER = {
  none: colors.border,
  credit: colors.credit,
  debit: colors.debit,
  social: colors.social,
} as const;

export function Card({ children, accent = 'none', hero = false, style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { borderColor: ACCENT_BORDER[accent] },
        hero && styles.hero,
        style,
      ]}>
      {children}
    </View>
  );
}

/** Perforated divider — dashed, to read like a torn receipt. */
export function Perforation({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.perforation, style]} />;
}

/** Monospaced micro-label: SPLIT DETAIL #088, DINING, RENT. */
export function MonoTag({
  children,
  tone = 'muted',
  tint: tintOverride,
}: {
  children: string;
  tone?: 'muted' | 'credit' | 'debit' | 'social';
  /** A category colour token's tint. Overrides `tone` — see theme.categoryColors. */
  tint?: string;
}) {
  const tint =
    tintOverride ??
    {
      muted: colors.textMuted,
      credit: colors.credit,
      debit: colors.debit,
      social: colors.social,
    }[tone];

  return (
    <View style={[styles.tag, { borderColor: tint }]}>
      <Text style={[styles.tagText, { color: tint }]}>{children.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1.5,
    paddingVertical: space.md,
    paddingHorizontal: space.base,
  },
  hero: {
    padding: space.lg,
  },
  perforation: {
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.border,
    marginVertical: space.md,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.micro,
    borderWidth: 1.5,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  tagText: {
    ...type.monoSm,
  },
});
