/**
 * "Edit & approve": the normal entry sheet, prefilled from a pending item.
 * The inbox owns the write; the sheet only collects the fields.
 */

import { colors, money, space, type } from '@loop/shared';
import { router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { type ApprovalSource, ExpenseEntryScreen } from '@/features/expenses';

import { approvePendingExpense } from '../api/pending-expenses-repository';
import { usePendingExpenses } from '../hooks/use-pending-expenses';
import type { PendingExpense } from '../model/approval';

export function ApprovePendingScreen({ pendingId }: { pendingId: string | undefined }) {
  const { uid } = useSession();
  const pending = usePendingExpenses();

  // Approving removes the item from the live list while the sheet is closing;
  // hold on to it so the sheet does not flash "gone" on its way out.
  const found = useRef<PendingExpense | null>(null);
  if (pending.status === 'ready') {
    found.current = pending.snapshot.items.find((i) => i.id === pendingId) ?? found.current;
  }
  const item = found.current;

  const approval: ApprovalSource | null = useMemo(
    () =>
      item && {
        initial: {
          total: money(item.amountMinor, item.currency),
          categoryId: item.suggestedCategoryId,
          description: item.merchant ?? '',
          occurredAt: item.occurredAt,
        },
        submit: (fields) =>
          approvePendingExpense(uid, item, fields.categoryId, {
            total: fields.total,
            description: fields.description,
            note: fields.note,
            occurredAt: fields.occurredAt,
          }),
      },
    [item, uid],
  );

  if (pending.status === 'loading') return <View style={styles.screen} />;

  if (!approval) {
    return (
      <View style={[styles.screen, styles.centered]} testID="approve-missing">
        <Text style={styles.muted}>This transaction is no longer waiting for approval.</Text>
        <TactileButton label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return <ExpenseEntryScreen mode="approve" approval={approval} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  muted: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center' },
});
