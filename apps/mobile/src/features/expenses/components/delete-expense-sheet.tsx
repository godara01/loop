import { type Category, type Expense, categoryColors, colors, formatMoney, layout, radius, space, type } from '@loop/shared';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';

/**
 * Confirms a soft delete with the amount and category restated, so the user
 * sees exactly which receipt is going. See docs/03-expenses.md#delete.
 */
export function DeleteExpenseSheet({
  expense,
  category,
  onCancel,
  onConfirm,
}: {
  /** The sheet is open while this is set. */
  expense: Expense | null;
  category: Category | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={expense !== null} animationType="slide" transparent statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable testID="delete-backdrop" style={StyleSheet.absoluteFill} accessibilityLabel="Cancel" onPress={onCancel} />
        {expense ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.base }]} testID="delete-sheet">
            <Text style={styles.eyebrow}>DELETE EXPENSE</Text>
            <View style={styles.receipt}>
              <View style={styles.meta}>
                {category ? (
                  <MonoTag tint={categoryColors[category.colorToken].tint}>{category.slug}</MonoTag>
                ) : (
                  <MonoTag>unknown</MonoTag>
                )}
              </View>
              <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(expense.total)}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {expense.description || category?.name || 'No description'}
              </Text>
            </View>
            <Text style={styles.help}>It leaves your ledger and totals. You can undo for a few seconds.</Text>
            <View style={styles.actions}>
              <TactileButton testID="delete-cancel" label="Cancel" variant="secondary" style={styles.action} onPress={onCancel} />
              <TactileButton
                testID="delete-confirm"
                label="Delete"
                variant="destructive"
                style={styles.action}
                onPress={onConfirm}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    gap: space.md,
    padding: layout.screenMargin,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  eyebrow: { ...type.monoSm, color: colors.debit },
  receipt: {
    gap: space.xs,
    padding: space.base,
    backgroundColor: colors.input,
    borderColor: colors.debit,
    borderWidth: 1.5,
    borderRadius: radius.control,
  },
  meta: { flexDirection: 'row' },
  amount: { ...type.displayLg, fontFamily: type.monoLg.fontFamily, color: colors.text },
  title: { ...type.bodyLg, color: colors.text },
  help: { ...type.bodyMd, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  action: { flex: 1 },
});
