/**
 * Account detail (docs/18 § Screens): the balance hero, then this account's
 * transactions (either side of a transfer). Edit, Archive, and Delete — Delete
 * only when the account has no transactions; rules can't count, so this does.
 */

import { type Category, categoryColors, colors, layout, space, type } from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag } from '@/components/ui/surface';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories';
import { ExpenseRow } from '@/features/expenses/components/expense-row';
import { useRecentExpenses } from '@/features/expenses/hooks/use-expenses';
import { EMPTY_FILTER } from '@/features/expenses/model/ledger-filter';
import { useLedgerFilterStore } from '@/features/expenses/state/ledger-filter-store';
import { haptic } from '@/lib/haptics';

import { archiveAccount, deleteAccount } from '../api/account-repository';
import { BalanceText } from '../components/balance-text';
import { useAccountsOverview } from '../hooks/use-accounts';
import { asOfLabel } from '../model/accounts-view';

export function AccountDetailScreen({ accountId }: { accountId: string }) {
  const insets = useSafeAreaInsets();
  const { uid } = useSession();
  const state = useAccountsOverview();
  const categories = useCategories();
  // A generous window, like categories: this answers "is it safe to delete" and
  // lists recent activity; a full per-account ledger is the ledger's account facet (DP8).
  const recent = useRecentExpenses(500);
  const [error, setError] = useState<string | null>(null);

  const item = state.status === 'ready' ? state.balances.find((row) => row.account.id === accountId) : undefined;
  const categoriesById = useMemo(
    () => new Map<string, Category>(categories.status === 'ready' ? categories.snapshot.categories.map((c) => [c.id, c]) : []),
    [categories],
  );
  const transactions = useMemo(
    () => (recent.status === 'ready' ? recent.snapshot.expenses.filter((tx) => tx.accountId === accountId || tx.toAccountId === accountId) : []),
    [recent, accountId],
  );
  const pendingIds = recent.status === 'ready' ? recent.snapshot.pendingIds : new Set<string>();

  const report = (failure: unknown) => {
    haptic('error');
    setError(failure instanceof Error ? failure.message : String(failure));
  };

  if (!item) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
        <Pressable testID="account-detail-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.muted}>{state.status === 'loading' ? 'Loading…' : 'This account no longer exists.'}</Text>
      </View>
    );
  }
  const { account, balance } = item;
  const archived = account.archivedAt !== null;
  const deletable = recent.status === 'ready' && transactions.length === 0;

  const onArchive = () => {
    if (archived) {
      haptic('tap');
      archiveAccount(uid, account.id, false).catch(report);
      return;
    }
    haptic('warning');
    Alert.alert(
      `Archive ${account.name}?`,
      'Its transactions keep this account, and its balance still counts in the total until you move it out with a transfer.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => { haptic('destructive'); archiveAccount(uid, account.id, true).catch(report); } },
      ],
    );
  };

  const onDelete = () => {
    haptic('warning');
    Alert.alert(`Delete ${account.name}?`, 'It has no transactions, so nothing else changes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptic('destructive');
          deleteAccount(uid, account.id).catch(report);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView
      testID="screen-account-detail"
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + 120 }]}>
      <View style={styles.header}>
        <Pressable testID="account-detail-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Pressable
          testID="account-detail-edit"
          accessibilityRole="button"
          accessibilityLabel="Edit account"
          hitSlop={12}
          onPress={() => router.push({ pathname: '/accounts/[id]/edit' as never, params: { id: account.id } as never })}>
          <Text style={styles.action}>EDIT</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Card hero accent="credit" style={styles.hero}>
        <View style={styles.heroTop}>
          <MonoTag tint={categoryColors[account.colorToken].tint}>{account.name}</MonoTag>
          {account.last4 ? <Text style={styles.mono}>{`••${account.last4}`}</Text> : null}
          {archived ? <MonoTag>archived</MonoTag> : null}
        </View>
        <BalanceText account={account} balance={balance} large testID="account-detail-balance" />
        <Text style={styles.muted}>
          In Loop{state.status === 'ready' && state.asOf ? ` · ${asOfLabel(state.asOf)}` : ''}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Pressable testID="account-detail-archive" accessibilityRole="button" accessibilityLabel={archived ? 'Unarchive account' : 'Archive account'} onPress={onArchive} style={styles.actionRow}>
          <Ionicons name={archived ? 'arrow-undo-outline' : 'archive-outline'} size={16} color={colors.textMuted} />
          <Text style={styles.action}>{archived ? 'UNARCHIVE' : 'ARCHIVE'}</Text>
        </Pressable>
        {deletable ? (
          <Pressable testID="account-detail-delete" accessibilityRole="button" accessibilityLabel="Delete account" onPress={onDelete} style={styles.actionRow}>
            <Ionicons name="trash-outline" size={16} color={colors.debit} />
            <Text style={[styles.action, styles.danger]}>DELETE</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section}>RECENT TRANSACTIONS</Text>
        <Pressable
          testID="account-detail-ledger"
          accessibilityRole="link"
          accessibilityLabel="See all of this account's transactions in the ledger"
          hitSlop={8}
          onPress={() => {
            haptic('tap');
            useLedgerFilterStore.getState().setFilter({ ...EMPTY_FILTER, accountIds: [account.id] });
            router.push('/(tabs)/activity');
          }}>
          <Text style={styles.action}>SEE ALL →</Text>
        </Pressable>
      </View>
      <Card>
        {transactions.length === 0 ? (
          <Text testID="account-detail-empty" style={styles.muted}>Nothing on this account yet.</Text>
        ) : (
          transactions.map((tx) => (
            <ExpenseRow
              key={tx.id}
              expense={tx}
              category={categoriesById.get(tx.categoryId)}
              pending={pendingIds.has(tx.id)}
              onPress={() => router.push({ pathname: '/expense/[id]', params: { id: tx.id } })}
            />
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: space.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mono: { ...type.monoSm, color: colors.textMuted },
  muted: { ...type.bodySm, color: colors.textMuted },
  error: { ...type.bodySm, color: colors.debit },
  actions: { flexDirection: 'row', gap: space.lg },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  action: { ...type.monoSm, color: colors.credit },
  danger: { color: colors.debit },
  section: { ...type.monoSm, color: colors.textMuted },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
});
