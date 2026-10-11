import { colors, radius, space, type } from '@loop/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';

import type { EntryKind } from '../model/entry-kind';

const OPTIONS: readonly { kind: EntryKind; label: string }[] = [
  { kind: 'expense', label: 'Spend' },
  { kind: 'income', label: 'Income' },
];

export function KindSwitch({
  value,
  onChange,
}: {
  value: EntryKind;
  onChange: (kind: EntryKind) => void;
}) {
  return (
    <View style={styles.wrap} testID="kind-switch" accessibilityRole="tablist" accessibilityLabel="Transaction kind">
      {OPTIONS.map((option) => {
        const selected = option.kind === value;
        return (
          <Pressable
            key={option.kind}
            testID={`kind-switch-${option.kind}`}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptic('selection');
              onChange(option.kind);
            }}
            style={[styles.option, selected && styles.selected]}>
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'stretch',
  },
  option: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...type.monoSm,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  labelSelected: {
    color: colors.text,
  },
});
