/**
 * Orbit's Accounts card (docs/18 § Orbit): up to 3 accounts by sortOrder plus
 * the total, shown only once an account exists. Data, not gamification, so
 * "Keep it plain" does not hide it.
 */

import { categoryColors, colors, formatMoney, space, type } from '@loop/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, MonoTag } from '@/components/ui/surface';
import { useSession } from '@/core/providers/bootstrap-provider';
import { haptic } from '@/lib/haptics';

import { useAccountsOverview } from '../hooks/use-accounts';
import { asOfLabel, orbitAccounts } from '../model/accounts-view';
import { BalanceText } from './balance-text';

export function AccountsCard() {
  const { profile } = useSession();
  const state = useAccountsOverview();
  const card = state.status === 'ready' ? orbitAccounts(state.balances, profile.currency) : null;
  if (!card) return null;

  return (
    <Pressable
      testID="orbit-accounts-card"
      accessibilityRole="button"
      accessibilityLabel={`Accounts, total ${formatMoney(card.total)} in Loop`}
      onPress={() => {
        haptic('tap');
        router.push('/accounts' as never);
      }}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>ACCOUNTS</Text>
          {state.status === 'ready' && state.asOf ? <MonoTag>{asOfLabel(state.asOf)}</MonoTag> : null}
        </View>
        {card.rows.map(({ account, balance }) => (
          <View key={account.id} style={styles.row}>
            <MonoTag tint={categoryColors[account.colorToken].tint}>{account.name}</MonoTag>
            <BalanceText account={account} balance={balance} />
          </View>
        ))}
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.eyebrow}>ACCOUNTS TOTAL · IN LOOP</Text>
          <Text testID="orbit-accounts-total" style={styles.total}>{formatMoney(card.total)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  totalRow: { borderTopWidth: 1.5, borderTopColor: colors.border, paddingTop: space.sm },
  total: { ...type.monoMd, color: colors.text },
});
