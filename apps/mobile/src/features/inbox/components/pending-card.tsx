import { type Category, categoryColors, colors, formatMoney, money, radius, space, type } from '@loop/shared';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';

import type { PendingExpense } from '../model/approval';

/**
 * One transaction waiting for a decision. The category is required in the MVP,
 * so Approve stays disabled until a chip is picked.
 */
export function PendingCard({
  item,
  categories,
  categoryId,
  onPickCategory,
  onApprove,
  onEdit,
  onDismiss,
}: {
  item: PendingExpense;
  categories: readonly Category[];
  categoryId: string | undefined;
  onPickCategory: (categoryId: string) => void;
  onApprove: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const id = item.id;
  const amount = formatMoney(money(item.amountMinor, item.currency));
  const time = new Date(item.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const title = item.merchant ?? 'Unknown merchant';

  return (
    <Card style={styles.card}>
      <View testID={`pending-card-${id}`} style={styles.body}>
        <View style={styles.top}>
          <View style={styles.info}>
            <Text style={styles.merchant} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.hint} numberOfLines={1}>
              {item.displayHint}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.amount} testID={`pending-card-${id}-amount`} accessibilityLabel={`Amount ${amount}`}>
              {amount}
            </Text>
            <Text style={styles.time}>{time}</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Category">
          {categories.map((category) => {
            const selected = category.id === categoryId;
            const { tint, onTint } = categoryColors[category.colorToken];
            return (
              <Pressable
                key={category.id}
                testID={`pending-card-${id}-category-${category.slug}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={category.name}
                onPress={() => {
                  if (selected) return;
                  haptic('selection');
                  onPickCategory(category.id);
                }}
                style={[styles.chip, { borderColor: tint }, selected && { backgroundColor: tint }]}>
                <Text style={[styles.chipLabel, { color: selected ? onTint : tint }]}>{category.slug}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.actions}>
          <TactileButton
            testID={`pending-card-${id}-dismiss`}
            label="Dismiss"
            variant="secondary"
            style={styles.action}
            onPress={onDismiss}
          />
          <TactileButton
            testID={`pending-card-${id}-edit`}
            label="Edit"
            variant="secondary"
            style={styles.action}
            onPress={onEdit}
          />
          <TactileButton
            testID={`pending-card-${id}-approve`}
            label="Approve"
            disabled={!categoryId}
            style={styles.action}
            onPress={onApprove}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md },
  body: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  info: { flex: 1, gap: space.xs },
  merchant: { ...type.bodyLg, color: colors.text },
  hint: { ...type.monoSm, color: colors.textMuted },
  right: { alignItems: 'flex-end', gap: space.xs },
  amount: { ...type.monoLg, color: colors.text },
  time: { ...type.monoSm, color: colors.textMuted },
  chips: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.micro,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
  },
  chipLabel: { ...type.monoMd },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
