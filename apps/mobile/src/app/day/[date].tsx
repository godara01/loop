/** Drill-down for one local calendar day within the Insights window. */

import {
  type Category,
  addDays,
  categoryColors,
  colors,
  displayPercentages,
  formatMoney,
  layout,
  space,
  sum,
  totalsByCategory,
  totalsByDay,
  type,
} from '@loop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { useCategories } from '@/features/categories';
import { ExpenseRow, useExpensesForPeriod } from '@/features/expenses';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/core/providers/bootstrap-provider';

export default function DayDetailScreen() {
  const insets = useSafeAreaInsets();
  const { date, startDate, endDate } = useLocalSearchParams<{ date: string; startDate?: string; endDate?: string }>();
  const { profile } = useSession();
  const [selectedDate, setSelectedDate] = useState(date);
  const period = useMemo(
    () => ({ startDate: startDate ?? selectedDate, endDate: endDate ?? addDays(selectedDate, 1) }),
    [startDate, endDate, selectedDate],
  );
  const allExpenses = useExpensesForPeriod(period);
  const selectedExpenses = useExpensesForPeriod({ startDate: selectedDate, endDate: addDays(selectedDate, 1) });
  const categories = useCategories();
  const categoriesById = useMemo(
    () => new Map<string, Category>(categories.status === 'ready' ? categories.snapshot.categories.map((category) => [category.id, category]) : []),
    [categories],
  );
  const dayRecords = selectedExpenses.status === 'ready'
    ? [...selectedExpenses.snapshot.expenses].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    : [];
  const total = sum(dayRecords.map((expense) => expense.total), profile.currency);
  const categoryTotals = totalsByCategory(dayRecords, { startDate: selectedDate, endDate: addDays(selectedDate, 1) }, profile.currency);
  const percentages = displayPercentages(categoryTotals);
  const rank = useMemo(() => {
    if (allExpenses.status !== 'ready') return null;
    const spentDays = totalsByDay(allExpenses.snapshot.expenses, period, profile.currency)
      .filter((day) => day.count > 0)
      .sort((left, right) => right.total.minor - left.total.minor || left.date.localeCompare(right.date));
    const index = spentDays.findIndex((day) => day.date === selectedDate);
    return index < 0 ? null : { position: index + 1, total: spentDays.length };
  }, [allExpenses, period, profile.currency, selectedDate]);

  const move = useCallback((direction: -1 | 1) => {
    const next = addDays(selectedDate, direction);
    if (next < period.startDate || next >= period.endDate) return;
    haptic('selection');
    setSelectedDate(next);
  }, [period.endDate, period.startDate, selectedDate]);
  const pan = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -60) move(1);
        if (gesture.dx >= 60) move(-1);
      },
    }),
    [move],
  );

  return (
    <ScrollView {...pan.panHandlers} testID="screen-day-detail" style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: space['3xl'] }]} showsVerticalScrollIndicator={false}>
      <View style={styles.nav}><Pressable testID="day-back" accessibilityLabel="Back to insights" onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.eyebrow}>DAY DETAIL</Text></View>
      <View style={styles.dateRow}>
        <Pressable testID="day-previous" accessibilityRole="button" accessibilityLabel="Previous day" disabled={selectedDate <= period.startDate} onPress={() => move(-1)}><Text style={[styles.step, selectedDate <= period.startDate && styles.disabled]}>‹</Text></Pressable>
        <Text testID="day-detail-date" style={styles.title}>{selectedDate}</Text>
        <Pressable testID="day-next" accessibilityRole="button" accessibilityLabel="Next day" disabled={addDays(selectedDate, 1) >= period.endDate} onPress={() => move(1)}><Text style={[styles.step, addDays(selectedDate, 1) >= period.endDate && styles.disabled]}>›</Text></Pressable>
      </View>
      <Text testID="day-detail-total" style={styles.total}>{formatMoney(total)}</Text>
      {rank ? <Text style={styles.rank}>#{rank.position} SPENDING DAY OF {rank.total}</Text> : <Text style={styles.rank}>NO SPEND THIS DAY</Text>}

      {categoryTotals.length > 0 ? <View style={styles.breakdown}>{categoryTotals.map((row, index) => {
        const category = categoriesById.get(row.categoryId);
        const tint = category ? categoryColors[category.colorToken].tint : colors.textMuted;
        return <View key={row.categoryId} style={styles.category}><View style={styles.categoryTop}><MonoTag tint={tint}>{category?.name ?? 'Unknown'}</MonoTag><Text style={styles.amount}>{formatMoney(row.total)} · {percentages[index]}%</Text></View><View style={styles.track}><View style={[styles.bar, { width: `${Math.max(2, row.share * 100)}%`, backgroundColor: tint }]} /></View></View>;
      })}</View> : <Text style={styles.empty}>A quiet day.</Text>}

      <Text style={styles.section}>EXPENSES</Text>
      {dayRecords.map((expense) => <ExpenseRow key={expense.id} expense={expense} category={categoriesById.get(expense.categoryId)} pending={selectedExpenses.status === 'ready' && selectedExpenses.snapshot.pendingIds.has(expense.id)} onPress={() => { haptic('tap'); router.push({ pathname: '/expense/[id]', params: { id: expense.id } }); }} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: layout.screenMargin, gap: space.md }, nav: { flexDirection: 'row', alignItems: 'center', gap: space.md }, back: { ...type.displayLg, color: colors.credit }, eyebrow: { ...type.monoSm, color: colors.textMuted }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, step: { ...type.displayLg, color: colors.credit, paddingHorizontal: space.sm }, disabled: { color: colors.border }, title: { ...type.headlineLg, color: colors.text }, total: { ...type.displayLg, color: colors.credit }, rank: { ...type.monoSm, color: colors.textMuted }, breakdown: { gap: space.md, marginTop: space.sm }, category: { gap: space.xs }, categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }, amount: { ...type.monoSm, color: colors.text }, track: { height: 8, backgroundColor: colors.input, borderRadius: 99, overflow: 'hidden' }, bar: { height: '100%', borderRadius: 99 }, section: { ...type.monoSm, color: colors.textMuted, marginTop: space.md }, empty: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center', marginVertical: space.lg },
});
