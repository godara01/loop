import { categoryColors, colors, formatMoney, layout, space, type } from '@loop/shared';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag, Perforation } from '@/components/ui/surface';
import { EXPENSES, ME, categoryOf, nameOf } from '@/data/mock';

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const ordered = [...EXPENSES].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.base, paddingBottom: 140 },
      ]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>LEDGER</Text>
      <Text style={styles.title}>Activity</Text>

      {ordered.map((expense) => {
        const myShare = expense.allocations.find((a) => a.memberId === ME);
        const category = categoryOf(expense.categoryId);
        return (
          <Card key={expense.id} style={styles.card}>
            <View style={styles.head}>
              <MonoTag tint={categoryColors[category.colorToken].tint}>
                {category.slug}
              </MonoTag>
              <Text style={styles.date}>
                {new Date(expense.occurredAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                })}
              </Text>
            </View>

            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.description}>{expense.description}</Text>
                <Text style={styles.payer}>
                  {expense.paidBy === ME ? 'You paid' : `${nameOf(expense.paidBy)} paid`}
                </Text>
              </View>
              <Text style={styles.total}>{formatMoney(expense.total)}</Text>
            </View>

            {myShare && expense.allocations.length > 1 ? (
              <>
                <Perforation />
                <View style={styles.row}>
                  <Text style={styles.shareLabel}>
                    YOUR SHARE · {expense.allocations.length}-WAY
                  </Text>
                  <Text style={styles.share}>{formatMoney(myShare.amount)}</Text>
                </View>
              </>
            ) : null}
          </Card>
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
  card: { paddingVertical: space.base, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { ...type.monoSm, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  info: { flex: 1, gap: 3 },
  description: { ...type.bodyLg, color: colors.text },
  payer: { ...type.bodySm, color: colors.textMuted },
  total: { ...type.monoLg, fontSize: 17, color: colors.text },
  shareLabel: { ...type.monoSm, color: colors.textMuted },
  share: { ...type.monoMd, color: colors.credit },
});
