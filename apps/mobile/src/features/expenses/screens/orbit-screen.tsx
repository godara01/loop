/**
 * Orbit — today at a glance: what has been spent, and the last few entries.
 * The streak and check-in join in Phase 4; nothing here is faked until then.
 */

import { type Category, colors, formatMoney, layout, money, space, sum, todayISO, type } from '@loop/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag, Perforation } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories';

import { ExpenseRow } from '../components/expense-row';
import { useExpensesForLastDays, useRecentExpenses } from '../hooks/use-expenses';

const RECENT_COUNT = 5;

export function OrbitScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const today = useExpensesForLastDays(1);
  const recent = useRecentExpenses(RECENT_COUNT);
  const categoriesState = useCategories();

  const categoriesById = useMemo(
    () =>
      new Map<string, Category>(
        categoriesState.status === 'ready' ? categoriesState.snapshot.categories.map((c) => [c.id, c]) : [],
      ),
    [categoriesState],
  );

  const todayIso = todayISO();
  const todays =
    today.status === 'ready' ? today.snapshot.expenses.filter((e) => e.localDate === todayIso) : [];
  const total = sum(
    todays.map((e) => e.total),
    profile.currency,
  );

  return (
    <ScrollView
      testID="screen-orbit"
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: 160 }]}
      showsVerticalScrollIndicator={false}>
      <View>
        <Text style={styles.eyebrow}>ORBIT</Text>
        <Text style={styles.title}>Today</Text>
      </View>

      <Card hero accent="credit" style={styles.hero}>
        <MonoTag tone="credit">spent today</MonoTag>
        <Text testID="orbit-today-total" style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(today.status === 'ready' ? total : money(0, profile.currency))}
        </Text>
        <Text style={styles.caption} testID="orbit-today-count">
          {todays.length === 0
            ? 'Nothing logged today.'
            : `${todays.length} ${todays.length === 1 ? 'expense' : 'expenses'} logged`}
        </Text>
      </Card>

      <TactileButton label="Log an expense" fullWidth onPress={() => router.push('/expense/new')} />

      <Text style={styles.section}>Recent</Text>
      <Card>
        {recent.status === 'ready' && recent.snapshot.expenses.length > 0 ? (
          recent.snapshot.expenses.map((expense, index) => (
            <View key={expense.id}>
              {index > 0 ? <Perforation style={styles.tightPerforation} /> : null}
              <ExpenseRow
                expense={expense}
                category={categoriesById.get(expense.categoryId)}
                pending={recent.snapshot.pendingIds.has(expense.id)}
                onPress={() => router.push({ pathname: '/expense/[id]', params: { id: expense.id } })}
              />
            </View>
          ))
        ) : (
          <Text style={styles.empty} testID="orbit-recent-empty">
            {recent.status === 'loading' ? 'Loading…' : 'Your first expense will show up here.'}
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
  hero: { gap: space.sm },
  heroAmount: { ...type.displayLg, fontSize: 44, lineHeight: 50, color: colors.credit },
  caption: { ...type.bodyMd, color: colors.textMuted },
  section: { ...type.headlineSm, color: colors.text, marginTop: space.sm },
  empty: { ...type.bodyMd, color: colors.textMuted, paddingVertical: space.sm },
  tightPerforation: { marginVertical: 0 },
});
