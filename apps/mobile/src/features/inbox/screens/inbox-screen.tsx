/**
 * The inbox: transactions read from bank messages, waiting for a human
 * decision. Nothing here is an expense until it is approved.
 * See docs/12-sms-ingest.md#the-inbox.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type Category,
  type Expense,
  addDays,
  colors,
  layout,
  money,
  orderForEntry,
  refundableRemainder,
  space,
  todayISO,
  type,
} from '@loop/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useAccounts } from '@/features/accounts/hooks/use-accounts';
import { useCategories } from '@/features/categories';
import { useExpensesForLastDays } from '@/features/expenses/hooks/use-expenses';
import { EMPTY_STATES } from '@/lib/empty-states';
import { haptic } from '@/lib/haptics';

import {
  approveAllPendingExpenses,
  approvePendingExpense,
  approvePendingRefund,
  approvePendingTransfer,
  dismissPendingExpense,
  mergePendingTransfer,
} from '../api/pending-expenses-repository';
import { CardBillCard, PairCard, PurchasePicker, RefundCard } from '../components/kind-cards';
import { PasteSheet } from '../components/paste-sheet';
import { PendingCard } from '../components/pending-card';
import { REFUND_WINDOW_DAYS } from '../hooks/use-ingest-suggestions';
import { usePendingExpenses } from '../hooks/use-pending-expenses';
import type { CategoryChoices, PendingExpense } from '../model/approval';
import { type InboxCard, bulkFromCards, canApproveAll, inboxCards, localDateIn, pairKey } from '../model/inbox-view';

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
  const accountsState = useAccounts();
  // Refund originals, their earlier refunds, and the "Different purchase" list (docs/17: 60 days).
  const recent = useExpensesForLastDays(REFUND_WINDOW_DAYS);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickedAccount, setPickedAccount] = useState<Record<string, string | null>>({});
  const [keptSeparate, setKeptSeparate] = useState<ReadonlySet<string>>(new Set());
  const [pickingFor, setPickingFor] = useState<PendingExpense | null>(null);
  const [pasting, setPasting] = useState(false);

  const allCategories: Category[] = useMemo(
    () =>
      categoriesState.status === 'ready' ? orderForEntry(categoriesState.snapshot.categories, new Map(), false) : [],
    [categoriesState],
  );
  // v1.2: expense cards offer expense categories, income cards income ones.
  const categories = useMemo(() => allCategories.filter((c) => (c.type ?? 'expense') === 'expense'), [allCategories]);
  const incomeCategories = useMemo(() => allCategories.filter((c) => c.type === 'income'), [allCategories]);
  const otherIncomeId = incomeCategories.find((c) => c.slug === 'OTHER_IN')?.id ?? incomeCategories[0]?.id;

  const accounts = useMemo(
    () => (accountsState.status === 'ready' ? accountsState.snapshot.accounts.filter((a) => a.archivedAt === null) : []),
    [accountsState],
  );
  const live = useMemo(() => (recent.status === 'ready' ? recent.snapshot.expenses.filter((e) => e.deletedAt === null) : []), [recent]);
  const expensesById = useMemo(() => new Map(live.map((e) => [e.id, e] as const)), [live]);
  const refundsOf = (original: Expense) => live.filter((e) => e.kind === 'refund' && e.refundOf === original.id);

  const items: readonly PendingExpense[] = pending.status === 'ready' ? pending.snapshot.items : [];
  const cards = useMemo(() => inboxCards(items, { accounts, expensesById, keptSeparate }), [items, accounts, expensesById, keptSeparate]);
  const accountChoice = (item: PendingExpense, suggested: string | null) =>
    pickedAccount[item.id] !== undefined ? pickedAccount[item.id]! : suggested;

  // A pick wins; otherwise a (post-MVP) suggestion prefills the chip.
  const choices: CategoryChoices = useMemo(() => {
    const result: Record<string, string | undefined> = {};
    for (const item of items) result[item.id] = picked[item.id] ?? item.suggestedCategoryId ?? undefined;
    return result;
  }, [items, picked]);

  const sections = useMemo(() => {
    const zone = deviceTimeZone();
    const days: { date: string; data: InboxCard[] }[] = [];
    for (const card of cards) {
      const date = localDateIn(card.type === 'pair' ? card.pair.debit.occurredAt : card.item.occurredAt, zone);
      const last = days[days.length - 1];
      if (last?.date === date) last.data.push(card);
      else days.push({ date, data: [card] });
    }
    return days;
  }, [cards]);
  const bulk = bulkFromCards(cards);

  const approveAllEnabled = canApproveAll(bulk, choices);
  const today = todayISO();

  /** Builders throw synchronously on bad input, before anything is written. */
  const attempt = (write: () => Promise<void>) => {
    try {
      write().catch(logWriteFailure);
      haptic('expenseSaved');
    } catch (error) {
      haptic('error');
      Alert.alert('Could not approve', error instanceof Error ? error.message : String(error));
    }
  };

  const approve = (item: PendingExpense, suggestedAccount: string | null) =>
    attempt(() => approvePendingExpense(uid, item, choices[item.id], { accountId: accountChoice(item, suggestedAccount) }));

  const approveRefund = (item: PendingExpense, original: Expense) =>
    attempt(() => approvePendingRefund(uid, item, original, refundsOf(original)));

  const approveAsIncome = (item: PendingExpense) => {
    if (!otherIncomeId) return Alert.alert('No income category', 'Add an income category first.');
    attempt(() => approvePendingExpense(uid, item, picked[item.id] ?? item.suggestedCategoryId ?? otherIncomeId, { asIncome: true }));
  };

  // "Different purchase" candidates: live purchases with this much still to refund.
  const pickerCandidates = useMemo(() => {
    if (!pickingFor) return [];
    return live
      .filter((e) => (e.kind ?? 'expense') === 'expense' && !e.excludeFromSpend)
      .filter((e) => refundableRemainder(e, live.filter((r) => r.kind === 'refund' && r.refundOf === e.id)).minor >= pickingFor.amountMinor)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [pickingFor, live]);

  const dismiss = (item: PendingExpense) => {
    haptic('destructive');
    dismissPendingExpense(uid, item.id).catch(logWriteFailure);
  };

  const approveAll = () => {
    if (!approveAllEnabled) return haptic('warning');
    const count = bulk.length;
    haptic('tap');
    Alert.alert(`Approve ${count} ${count === 1 ? 'expense' : 'expenses'}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Approve ${count}`,
        onPress: () => {
          try {
            approveAllPendingExpenses(uid, bulk, choices).catch(logWriteFailure);
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
        keyExtractor={(card) => card.id}
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
            <TactileButton
              testID="inbox-paste"
              label="Paste a message"
              variant="secondary"
              onPress={() => setPasting(true)}
            />
            {pending.status === 'ready' && pending.snapshot.fromCache ? <MonoTag>offline</MonoTag> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader} testID={`inbox-day-${section.date}`}>
            <Text style={styles.dayLabel}>{dayLabel(section.date, today).toUpperCase()}</Text>
          </View>
        )}
        renderItem={({ item: card }) => {
          if (card.type === 'pair') {
            return (
              <PairCard
                id={card.id}
                debit={card.pair.debit}
                from={card.from}
                to={card.to}
                onMerge={() => attempt(() => mergePendingTransfer(uid, card.pair, card.from.id, card.to.id))}
                onKeepSeparate={() => {
                  haptic('tap');
                  setKeptSeparate((kept) => new Set([...kept, pairKey(card.pair)]));
                }}
              />
            );
          }
          if (card.type === 'refund') {
            return (
              <RefundCard
                item={card.item}
                original={card.original}
                onYes={() => card.original && approveRefund(card.item, card.original)}
                onDifferent={() => {
                  haptic('tap');
                  setPickingFor(card.item);
                }}
                onIncome={() => approveAsIncome(card.item)}
                onDismiss={() => dismiss(card.item)}
              />
            );
          }
          if (card.type === 'transfer') {
            const from = pickedAccount[card.item.id] ?? null;
            return (
              <CardBillCard
                item={card.item}
                toAccount={card.toAccount}
                accounts={accounts}
                fromAccountId={from}
                onPickFrom={(accountId) => setPickedAccount((p) => ({ ...p, [card.item.id]: accountId }))}
                onApprove={() => card.toAccount && from && attempt(() => approvePendingTransfer(uid, card.item, from, card.toAccount!.id))}
                onDismiss={() => dismiss(card.item)}
              />
            );
          }
          const item = card.item;
          const suggested = card.account?.id ?? null;
          return (
            <PendingCard
              item={item}
              income={card.type === 'income'}
              categories={card.type === 'income' ? incomeCategories : categories}
              categoryId={choices[item.id]}
              onPickCategory={(categoryId) => setPicked((p) => ({ ...p, [item.id]: categoryId }))}
              accounts={accounts}
              accountId={accountChoice(item, suggested)}
              onPickAccount={(accountId) => setPickedAccount((p) => ({ ...p, [item.id]: accountId }))}
              onApprove={() => approve(item, suggested)}
              onEdit={() => {
                haptic('tap');
                router.push({ pathname: '/expense/approve/[pendingId]', params: { pendingId: item.id } });
              }}
              onDismiss={() => dismiss(item)}
            />
          );
        }}
        ListEmptyComponent={
          pending.status === 'loading' ? null : pending.status === 'error' ? (
            <Text style={styles.empty}>{pending.message}</Text>
          ) : (
            <View style={styles.emptyState} testID="inbox-empty">
              <Ionicons name="mail-open-outline" size={40} color={colors.textMuted} />
              <Text style={styles.empty}>{EMPTY_STATES.inbox}</Text>
            </View>
          )
        }
      />

      <PasteSheet visible={pasting} onClose={() => setPasting(false)} />

      <PurchasePicker
        visible={pickingFor !== null}
        amount={pickingFor ? money(pickingFor.amountMinor, pickingFor.currency) : money(0, 'INR')}
        candidates={pickerCandidates}
        onPick={(original) => {
          const item = pickingFor;
          setPickingFor(null);
          if (item) approveRefund(item, original);
        }}
        onClose={() => setPickingFor(null)}
      />

      {bulk.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.base }]}>
          <TactileButton
            testID="inbox-approve-all"
            label={`Approve all · ${bulk.length}`}
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
