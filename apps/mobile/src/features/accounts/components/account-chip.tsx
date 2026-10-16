/**
 * The entry sheet's account chip (docs/18 § Entry sheet integration): one chip
 * showing the current choice (`HDFC ▾`), opening a small sheet of active
 * accounts plus None. Hidden by the caller until an active account exists.
 */

import { type Account, categoryColors, colors, layout, radius, space, type } from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';

export function AccountChip({
  accounts,
  value,
  onChange,
  label = 'Account',
  testID = 'entry-account',
}: {
  /** Active accounts, in sortOrder. */
  accounts: readonly Account[];
  value: string | null;
  onChange: (accountId: string | null) => void;
  label?: string;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = value ? accounts.find((account) => account.id === value) : undefined;
  const name = selected?.name ?? 'No account';

  const choose = (accountId: string | null) => {
    haptic('selection');
    onChange(accountId);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${name}. Change account`}
        onPress={() => {
          haptic('tap');
          setOpen(true);
        }}
        style={[styles.chip, selected && { borderColor: categoryColors[selected.colorToken].tint }]}>
        <Ionicons name="wallet-outline" size={14} color={selected ? categoryColors[selected.colorToken].tint : colors.textMuted} />
        <Text style={[styles.chipText, !selected && styles.chipTextMuted]} numberOfLines={1}>{name}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable testID={`${testID}-backdrop`} accessibilityRole="button" accessibilityLabel="Close account choice" style={styles.backdrop} onPress={() => setOpen(false)} />
        <View testID={`${testID}-sheet`} style={[styles.sheet, { paddingBottom: insets.bottom + space.base }]}>
          <Text style={styles.eyebrow}>{label.toUpperCase()}</Text>
          <ScrollView style={styles.list}>
            {accounts.map((account) => (
              <Pressable
                key={account.id}
                testID={`${testID}-option-${account.id}`}
                accessibilityRole="radio"
                accessibilityLabel={account.name}
                accessibilityState={{ selected: account.id === value }}
                onPress={() => choose(account.id)}
                style={[styles.option, account.id === value && styles.optionSelected]}>
                <View style={[styles.dot, { backgroundColor: categoryColors[account.colorToken].tint }]} />
                <Text style={styles.optionText}>{account.name}</Text>
                {account.last4 ? <Text style={styles.mono}>{`••${account.last4}`}</Text> : null}
              </Pressable>
            ))}
            <Pressable
              testID={`${testID}-option-none`}
              accessibilityRole="radio"
              accessibilityLabel="No account"
              accessibilityState={{ selected: value === null }}
              onPress={() => choose(null)}
              style={[styles.option, value === null && styles.optionSelected]}>
              <View style={[styles.dot, styles.dotNone]} />
              <Text style={styles.optionText}>None</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  chipText: { ...type.monoSm, color: colors.text, flexShrink: 1 },
  chipTextMuted: { color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopWidth: 1.5,
    borderColor: colors.border,
    borderTopLeftRadius: radius.control,
    borderTopRightRadius: radius.control,
    paddingHorizontal: layout.screenMargin,
    paddingTop: space.base,
    gap: space.sm,
  },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  list: { maxHeight: 360 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.control,
  },
  optionSelected: { borderColor: colors.credit },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotNone: { borderWidth: 1.5, borderColor: colors.textMuted },
  optionText: { ...type.bodyLg, color: colors.text, flex: 1 },
  mono: { ...type.monoSm, color: colors.textMuted },
});
