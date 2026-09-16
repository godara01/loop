import { type Category, type Expense, categoryColors, colors, formatMoney, space, type } from '@loop/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MonoTag } from '@/components/ui/surface';
import { haptic } from '@/lib/haptics';

export function ExpenseRow({
  expense,
  category,
  pending,
  onPress,
}: {
  expense: Expense;
  category: Category | undefined;
  /** Written locally, not yet acknowledged by the server. */
  pending: boolean;
  onPress: () => void;
}) {
  const time = new Date(expense.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const title = expense.description || category?.name || 'Expense';

  return (
    <Pressable
      testID={`expense-row-${expense.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatMoney(expense.total)}`}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.info}>
        <View style={styles.meta}>
          {category ? (
            <MonoTag tint={categoryColors[category.colorToken].tint}>{category.slug}</MonoTag>
          ) : (
            <MonoTag>unknown</MonoTag>
          )}
          <Text style={styles.time}>{time}</Text>
          {pending ? <Text style={styles.pending}>SYNCING</Text> : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={styles.amount} testID={`expense-row-${expense.id}-amount`}>
        {formatMoney(expense.total)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  pressed: { opacity: 0.7 },
  info: { flex: 1, gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  time: { ...type.monoSm, color: colors.textMuted },
  pending: { ...type.monoSm, color: colors.social },
  title: { ...type.bodyLg, color: colors.text },
  amount: { ...type.monoLg, fontSize: 17, color: colors.text },
});
