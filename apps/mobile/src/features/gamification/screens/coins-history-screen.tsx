/**
 * Every coin award, newest first. See docs/06-gamification.md.
 */

import { type CoinLedgerEntryDoc, colors, layout, space, type } from '@loop/shared';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Perforation } from '@/components/ui/surface';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCoinLedger } from '@/features/gamification/hooks/use-gamification';

const RULE_LABELS: Record<string, string> = {
  check_in: 'Daily check-in',
  zero_spend: 'Zero-spend day',
  expense_logged: 'Expense logged',
  categorised: 'Categorised',
  week_complete: 'Seven-day run',
  first_expense: 'First expense',
  first_custom_category: 'First custom category',
};

function CoinEntry({ entry }: { entry: CoinLedgerEntryDoc }) {
  const date = new Date(entry.createdAt);
  const formattedDate = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const formattedTime = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.entry}>
      <View style={styles.entryMain}>
        <Text style={styles.entryTitle}>{RULE_LABELS[entry.ruleId] ?? entry.ruleId}</Text>
        <Text style={styles.entryDate}>{formattedDate} · {formattedTime}</Text>
      </View>
      <View style={styles.coinChip}>
        <Text style={styles.coinPlus}>+</Text>
        <Text style={styles.coinAmount}>{entry.coins}</Text>
      </View>
    </View>
  );
}

export function CoinsHistoryScreen() {
  const insets = useSafeAreaInsets();
  const coinLedgerState = useCoinLedger();
  const { profile } = useSession();

  const entries = useMemo(() => {
    return coinLedgerState.status === 'ready' ? coinLedgerState.snapshot.entries : [];
  }, [coinLedgerState]);

  const totalCoins = useMemo(() => {
    return entries.reduce((sum, entry) => sum + entry.coins, 0);
  }, [entries]);

  const handleRefresh = useCallback(() => {
    // TODO: Add pull-to-refresh
  }, []);

  return (
    <ScrollView
      testID="screen-coins-history"
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: 160 }]}
      showsVerticalScrollIndicator={false}>
      <View>
        <Text style={styles.eyebrow}>COINS</Text>
        <Text style={styles.title}>Rewards earned</Text>
      </View>

      <Card hero accent="credit" style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total coins</Text>
        <Text style={styles.totalAmount}>{totalCoins}</Text>
        <Text style={styles.totalDescription}>
          Coins are a record of consistency. In v1 they are not spendable.
        </Text>
      </Card>

      <Text style={styles.section}>History</Text>
      <Card style={styles.listCard}>
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <Perforation style={styles.tightPerforation} /> : null}
              <CoinEntry entry={entry} />
            </View>
          ))
        ) : (
          <Text style={styles.empty} testID="coins-history-empty">
            {coinLedgerState.status === 'loading' ? 'Loading…' : 'No coins earned yet.'}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin, gap: space.md },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text, marginTop: 2 },
  totalCard: { gap: space.sm },
  totalLabel: { ...type.bodyMd, color: colors.textMuted },
  totalAmount: { ...type.displayLg, color: colors.credit },
  totalDescription: { ...type.bodySm, color: colors.textMuted },
  section: { ...type.headlineSm, color: colors.text, marginTop: space.sm },
  listCard: { gap: 0 },
  entry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  entryMain: { flex: 1, gap: 2 },
  entryTitle: { ...type.bodyMd, color: colors.text },
  entryDate: { ...type.bodySm, color: colors.textMuted },
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.credit,
    borderRadius: 99,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    minWidth: 40,
    justifyContent: 'center',
  },
  coinPlus: {
    ...type.monoSm,
    color: colors.onAccent,
    marginRight: 1,
  },
  coinAmount: {
    ...type.monoSm,
    color: colors.onAccent,
  },
  tightPerforation: { marginVertical: 0 },
  empty: {
    ...type.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: space.lg,
  },
});
