import {
  colors,
  formatMoney,
  layout,
  money,
  settleUp,
  space,
  type,
} from '@loop/shared';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag } from '@/components/ui/surface';
import { CURRENCY, ME, MEMBERS, SQUADS, expensesForSquad } from '@/data/mock';
import { haptic } from '@/lib/haptics';

export default function SquadsScreen() {
  const insets = useSafeAreaInsets();

  const squads = useMemo(
    () =>
      SQUADS.map((squad) => {
        const { balances } = settleUp(expensesForSquad(squad.id), CURRENCY);
        const mine = balances.find((b) => b.memberId === ME)?.net ?? money(0, CURRENCY);
        return { squad, mine };
      }),
    [],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.base, paddingBottom: 140 },
      ]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>SQUADS</Text>
      <Text style={styles.title}>Shared tabs</Text>

      {squads.map(({ squad, mine }) => {
        const owed = mine.minor >= 0;
        return (
          <Pressable key={squad.id} onPress={() => haptic('tap')}>
            <Card accent="social" style={styles.card}>
              <View style={styles.row}>
                <View style={styles.info}>
                  <Text style={styles.name}>{squad.name}</Text>
                  <Text style={styles.members}>
                    {squad.memberIds.map((id) => MEMBERS[id]?.displayName ?? id).join(' · ')}
                  </Text>
                </View>
                <View style={styles.amountColumn}>
                  <Text
                    style={[styles.amount, { color: owed ? colors.credit : colors.debit }]}>
                    {formatMoney(money(Math.abs(mine.minor), mine.currency))}
                  </Text>
                  <MonoTag tone={owed ? 'credit' : 'debit'}>
                    {owed ? 'you get' : 'you owe'}
                  </MonoTag>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin, gap: space.md },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text, marginTop: 2, marginBottom: space.xs },
  card: { paddingVertical: space.base },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  info: { flex: 1, gap: 4 },
  name: { ...type.headlineSm, color: colors.text },
  members: { ...type.bodySm, color: colors.textMuted },
  amountColumn: { alignItems: 'flex-end', gap: 6 },
  amount: { ...type.monoLg, fontSize: 18 },
});
