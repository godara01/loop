/**
 * The inbox: transactions read from bank messages, waiting for a human
 * decision. Nothing here is an expense until it is approved.
 * See docs/12-sms-ingest.md#the-inbox.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { type Category, addDays, colors, layout, orderForEntry, space, todayISO, type } from '@loop/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import {
  approveAllPendingExpenses,
  approvePendingExpense,
  dismissPendingExpense,
} from '../api/pending-expenses-repository';
import { PendingCard } from '../components/pending-card';
import { usePendingExpenses } from '../hooks/use-pending-expenses';
import type { CategoryChoices, PendingExpense } from '../model/approval';
import { canApproveAll, groupByDay } from '../model/inbox-view';

export const INBOX_EMPTY_COPY = 'Transaction messages will show up here for you to approve.';

const logWriteFailure = (error: unknown) => console.warn('[inbox] write rejected', error);

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { uid } = useSession();
  const pending = usePendingExpenses();
  const categoriesState = useCategories();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const categories: Category[] = useMemo(
    () =>
      categoriesState.status === 'ready' ? orderForEntry(categoriesState.snapshot.categories, new Map(), false) : [],
    [categoriesState],
  );

  const items: readonly PendingExpense[] = pending.status === 'ready' ? pending.snapshot.items : [];

  // A pick wins; otherwise a (post-MVP) suggestion prefills the chip.
  const choices: CategoryChoices = useMemo(() => {
    const result: Record<string, string | undefined> = {};
    for (const item of items) result[item.id] = picked[item.id] ?? item.suggestedCategoryId ?? undefined;
    return result;
  }, [items, picked]);

  const sections = useMemo(
    () => groupByDay(items, deviceTimeZone()).map((day) => ({ date: day.date, data: [...day.items] })),
    [items],
  );

  const approveAllEnabled = canApproveAll(items, choices);
  const today = todayISO();

  const approve = (item: PendingExpense) => {
    try {
      approvePendingExpense(uid, item, choices[item.id]).catch(logWriteFailure);
      haptic('expenseSaved');
    } catch (error) {
      haptic('error');
      Alert.alert('Could not approve', error instanceof Error ? error.message : String(error));
    }
  };

  const dismiss = (item: PendingExpense) => {
    haptic('destructive');
    dismissPendingExpense(uid, item.id).catch(logWriteFailure);
  };

  const approveAll = () => {
    if (!approveAllEnabled) return haptic('warning');
    const count = items.length;
    haptic('tap');
    Alert.alert(`Approve ${count} ${count === 1 ? 'expense' : 'expenses'}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Approve ${count}`,
        onPress: () => {
          try {
            approveAllPendingExpenses(uid, items, choices).catch(logWriteFailure);
            haptic('expenseSaved');
          } catch (error) {
            haptic('error');
            Alert.alert('Could not approve', error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.screen} testID="screen-inbox">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + 120 },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Pressable testID="inbox-close" accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </Pressable>
              <Text style={styles.eyebrow}>INBOX</Text>
            </View>
            <Text style={styles.title}>To approve</Text>
            {pending.status === 'ready' && pending.snapshot.fromCache ? <MonoTag>offline</MonoTag> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader} testID={`inbox-day-${section.date}`}>
            <Text style={styles.dayLabel}>{dayLabel(section.date, today).toUpperCase()}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <PendingCard
            item={item}
            categories={categories}
            categoryId={choices[item.id]}
            onPickCategory={(categoryId) => setPicked((p) => ({ ...p, [item.id]: categoryId }))}
            onApprove={() => approve(item)}
            onEdit={() => {
              haptic('tap');
              router.push({ pathname: '/expense/approve/[pendingId]', params: { pendingId: item.id } });
            }}
            onDismiss={() => dismiss(item)}
          />
        )}
        ListEmptyComponent={
          pending.status === 'loading' ? null : pending.status === 'error' ? (
            <Text style={styles.empty}>{pending.message}</Text>
          ) : (
            <View style={styles.emptyState} testID="inbox-empty">
              <Ionicons name="mail-open-outline" size={40} color={colors.textMuted} />
              <Text style={styles.empty}>{INBOX_EMPTY_COPY}</Text>
            </View>
          )
        }
      />

      {items.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.base }]}>
          <TactileButton
            testID="inbox-approve-all"
            label={`Approve all · ${items.length}`}
            fullWidth
            disabled={!approveAllEnabled}
            onPress={approveAll}
          />
          {!approveAllEnabled ? <Text style={styles.footerHint}>Pick a category on every card first.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin },
  header: { gap: space.sm, marginBottom: space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text },
  dayHeader: {
    backgroundColor: colors.background,
    paddingTop: space.base,
    paddingBottom: space.xs,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
  },
  dayLabel: { ...type.monoSm, color: colors.textMuted },
  empty: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center' },
  emptyState: { alignItems: 'center', gap: space.lg, marginTop: space['3xl'], paddingHorizontal: space.lg },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.sm,
    paddingTop: space.md,
    paddingHorizontal: layout.screenMargin,
    backgroundColor: colors.background,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
  },
  footerHint: { ...type.monoSm, color: colors.textMuted, textAlign: 'center' },
});
