/**
 * `/accounts` (docs/18 § Screens): active accounts with balances, drag to
 * reorder, an Unassigned row, the Accounts total, archived collapsed. With no
 * accounts it suggests Cash rather than seeding one.
 */

import { type Account, categoryColors, colors, formatMoney, layout, radius, space, type } from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
// Deep paths: the expenses index re-exports Orbit, which renders this feature.
import { EMPTY_FILTER } from '@/features/expenses/model/ledger-filter';
import { useLedgerFilterStore } from '@/features/expenses/state/ledger-filter-store';
import { EMPTY_STATES } from '@/lib/empty-states';
import { haptic } from '@/lib/haptics';

import { saveAccountOrder } from '../api/account-repository';
import { BalanceText } from '../components/balance-text';
import { type AccountWithBalance, useAccountsOverview } from '../hooks/use-accounts';
import { ACCOUNT_TYPES, accountsTotal, asOfLabel, reorderAccounts, splitAccounts } from '../model/accounts-view';

const glyphOf = (account: Account) => ACCOUNT_TYPES.find((t) => t.type === account.type)?.glyph ?? 'wallet-outline';

export function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const { uid, profile } = useSession();
  const state = useAccountsOverview();
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = state.status === 'ready' ? state.balances : [];
  const { active, archived } = splitAccounts(rows);

  const open = (account: Account) => {
    haptic('tap');
    router.push({ pathname: '/accounts/[id]' as never, params: { id: account.id } as never });
  };

  const onDragEnd = ({ data }: { data: AccountWithBalance[] }) => {
    haptic('dragDrop');
    saveAccountOrder(uid, reorderAccounts(data.map((row) => row.account.id), active.map((row) => row.account))).catch((failure: unknown) => {
      haptic('error');
      setError(failure instanceof Error ? failure.message : String(failure));
    });
  };

  const row = (item: AccountWithBalance, drag?: () => void, dragging = false) => (
    <Pressable
      key={item.account.id}
      testID={`accounts-row-${item.account.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.account.name}, ${formatMoney(item.balance)}`}
      accessibilityHint={drag ? 'Opens the account. Long-press to reorder.' : 'Opens the account.'}
      onPress={() => open(item.account)}
      onLongPress={drag}
      disabled={dragging}
      style={[styles.row, dragging && styles.rowDragging, item.account.archivedAt !== null && styles.rowArchived]}>
      <Ionicons name={glyphOf(item.account) as never} size={20} color={categoryColors[item.account.colorToken].tint} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.account.name}</Text>
        <View style={styles.rowMeta}>
          <MonoTag tint={categoryColors[item.account.colorToken].tint}>{item.account.type}</MonoTag>
          {item.account.last4 ? <Text style={styles.mono}>{`••${item.account.last4}`}</Text> : null}
        </View>
      </View>
      <BalanceText account={item.account} balance={item.balance} testID={`accounts-balance-${item.account.id}`} />
    </Pressable>
  );

  return (
    <View testID="screen-accounts" style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.base }]}>
      <View style={styles.header}>
        <Pressable testID="accounts-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>ACCOUNTS</Text>
        {state.status === 'ready' && state.asOf ? <MonoTag>{asOfLabel(state.asOf)}</MonoTag> : <View style={styles.headerSpacer} />}
      </View>

      {state.status === 'loading' ? <Text style={styles.muted}>Loading your accounts…</Text> : null}
      {state.status === 'error' ? <Text style={styles.error}>{state.message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {state.status === 'ready' && rows.length === 0 ? (
        <View style={styles.empty}>
          <Text testID="accounts-empty" style={styles.emptyText}>{EMPTY_STATES.accounts}</Text>
          <TactileButton
            testID="accounts-add-cash"
            label="Add Cash"
            fullWidth
            onPress={() => router.push({ pathname: '/accounts/new' as never, params: { suggest: 'cash' } as never })}
          />
          <TactileButton testID="accounts-add" label="Add another account" variant="secondary" fullWidth onPress={() => router.push('/accounts/new' as never)} />
        </View>
      ) : null}

      {rows.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>ACTIVE — DRAG TO REORDER</Text>
          <DraggableFlatList
            testID="accounts-active-list"
            data={active}
            keyExtractor={(item) => item.account.id}
            onDragBegin={() => haptic('dragStart')}
            onPlaceholderIndexChange={() => haptic('dragTick')}
            onDragEnd={onDragEnd}
            containerStyle={styles.list}
            renderItem={({ item, drag, isActive }: RenderItemParams<AccountWithBalance>) => row(item, drag, isActive)}
          />

          <Pressable
            testID="accounts-unassigned"
            accessibilityRole="button"
            accessibilityLabel="Unassigned: transactions with no account. Opens the ledger."
            onPress={() => {
              haptic('tap');
              useLedgerFilterStore.getState().setFilter({ ...EMPTY_FILTER, accountIds: ['none'] });
              router.push('/(tabs)/activity');
            }}
            style={[styles.row, styles.rowMuted]}>
            <Ionicons name="help-circle-outline" size={20} color={colors.textMuted} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>Unassigned</Text>
              <Text style={styles.muted}>Transactions with no account</Text>
            </View>
          </Pressable>

          <View style={styles.totalRow}>
            <Text style={styles.eyebrow}>ACCOUNTS TOTAL · IN LOOP</Text>
            <Text testID="accounts-total" style={styles.total}>{formatMoney(accountsTotal(rows, profile.currency))}</Text>
          </View>

          <TactileButton testID="accounts-add" label="Add account" variant="secondary" fullWidth onPress={() => router.push('/accounts/new' as never)} />

          {archived.length > 0 ? (
            <Pressable
              testID="accounts-toggle-archived"
              accessibilityRole="button"
              accessibilityLabel={showArchived ? 'Hide archived accounts' : 'Show archived accounts'}
              onPress={() => setShowArchived((value) => !value)}
              style={styles.archivedToggle}>
              <Text style={styles.muted}>{showArchived ? 'Hide' : 'Show'} archived ({archived.length})</Text>
            </Pressable>
          ) : null}
          {showArchived ? <ScrollView style={styles.archivedList}>{archived.map((item) => row(item))}</ScrollView> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenMargin, gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headerSpacer: { width: 26 },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  sectionLabel: { ...type.monoSm, color: colors.textMuted },
  muted: { ...type.bodySm, color: colors.textMuted },
  error: { ...type.bodySm, color: colors.debit },
  empty: { gap: space.md, marginTop: space['3xl'] },
  emptyText: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center' },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: space.xs,
  },
  rowDragging: { borderColor: colors.credit },
  rowArchived: { opacity: 0.6 },
  rowMuted: { backgroundColor: colors.background },
  rowInfo: { flex: 1, gap: 4 },
  rowName: { ...type.bodyLg, color: colors.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mono: { ...type.monoSm, color: colors.textMuted },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm, borderTopWidth: 1.5, borderTopColor: colors.border },
  total: { ...type.monoMd, color: colors.text },
  archivedToggle: { paddingVertical: space.md, alignItems: 'center' },
  archivedList: { maxHeight: 260 },
});
