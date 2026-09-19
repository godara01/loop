/** Category and day views over the same bounded, offline-first expense query. */

import {
  type Category,
  type PeriodKind,
  addDays,
  categoryColors,
  collapseLongTail,
  colors,
  compareToPrevious,
  displayPercentages,
  formatMoney,
  intensityStep,
  isCurrentPeriod,
  layout,
  periodOf,
  periodTotal,
  periodStats,
  previousPeriod,
  space,
  todayISO,
  totalsByCategory,
  totalsByDay,
  stepPeriod,
  type,
  weekdayAverages,
} from '@loop/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag } from '@/components/ui/surface';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useSettings } from '@/core/providers/settings-provider';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { useExpensesForPeriod } from '../hooks/use-expenses';

const PERIOD_LABEL: Record<PeriodKind, string> = { week: 'WEEK', month: 'MONTH', rolling30: '30 DAYS', custom: 'CUSTOM' };
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const { settings, update } = useSettings();
  const [period, setPeriod] = useState(() => periodOf(settings.insightsPeriod, todayISO()));
  const expenses = useExpensesForPeriod(period);
  const previousExpenses = useExpensesForPeriod(previousPeriod(period));
  const categories = useCategories();

  const categoriesById = useMemo(
    () => new Map<string, Category>(categories.status === 'ready' ? categories.snapshot.categories.map((item) => [item.id, item]) : []),
    [categories],
  );
  const model = useMemo(() => {
    const allRecords = expenses.status === 'ready' ? expenses.snapshot.expenses : [];
    const pendingIds = expenses.status === 'ready' ? expenses.snapshot.pendingIds : new Set<string>();
    const records = allRecords.filter((expense) => !pendingIds.has(expense.id));
    const totals = totalsByCategory(records, period, profile.currency);
    const days = totalsByDay(records, period, profile.currency);
    const maximum = Math.max(...days.map((day) => day.total.minor), 0);
    const weekdays = weekdayAverages(records, period, profile.currency);
    return {
      totals,
      days,
      maximum,
      weekdays,
      maximumWeekday: Math.max(...weekdays.map((value) => value.minor), 1),
      stats: periodStats(records, period, profile.currency),
    };
  }, [expenses, period, profile.currency]);
  const { visible, collapsed } = collapseLongTail(model.totals);
  const percentages = displayPercentages(model.totals);
  const percentageById = new Map(model.totals.map((row, index) => [row.categoryId, percentages[index] ?? 0]));
  const atPresent = isCurrentPeriod(period, todayISO());

  const changeKind = (kind: PeriodKind) => {
    haptic('selection');
    update({ insightsPeriod: kind });
    setPeriod(periodOf(kind, todayISO()));
  };
  const step = (direction: -1 | 1) => {
    if (direction === 1 && atPresent) return;
    haptic('selection');
    setPeriod((value) => stepPeriod(value, settings.insightsPeriod, direction, todayISO()));
  };

  const previousTotal = previousExpenses.status === 'ready'
    ? periodTotal(previousExpenses.snapshot.expenses, previousPeriod(period), profile.currency)
    : null;
  const delta = previousTotal ? compareToPrevious(model.stats.total, previousTotal) : null;

  return (
    <ScrollView
      testID="screen-insights"
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: 160 }]}
      showsVerticalScrollIndicator={false}>
      <View>
        <Text style={styles.eyebrow}>INSIGHTS</Text>
        <Text style={styles.title}>Where it went</Text>
      </View>

      <View style={styles.periodControl} accessibilityRole="tablist">
        {(Object.keys(PERIOD_LABEL) as PeriodKind[]).map((kind) => (
          <Pressable
            key={kind}
            testID={`insights-period-${kind}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: settings.insightsPeriod === kind }}
            onPress={() => changeKind(kind)}
            style={[styles.periodChip, settings.insightsPeriod === kind && styles.periodChipActive]}>
            <Text style={[styles.periodLabel, settings.insightsPeriod === kind && styles.periodLabelActive]}>{PERIOD_LABEL[kind]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.navigator}>
        <Pressable testID="insights-previous" onPress={() => step(-1)} hitSlop={10}><Text style={styles.nav}>‹</Text></Pressable>
        <View style={styles.rangeBlock}><Text testID="insights-period-current" style={styles.range}>{PERIOD_LABEL[settings.insightsPeriod]}</Text><Text style={styles.range}>{period.startDate} — {addDays(period.endDate, -1)}</Text></View>
        <Pressable testID="insights-next" onPress={() => step(1)} disabled={atPresent} hitSlop={10}><Text style={[styles.nav, atPresent && styles.disabled]}>›</Text></Pressable>
      </View>

      {expenses.status === 'loading' ? <Text style={styles.empty}>Loading your spending…</Text> : null}
      {expenses.status === 'error' ? <Text style={styles.error}>{expenses.message}</Text> : null}
      {expenses.status === 'ready' && model.stats.count === 0 ? (
        <Text testID="insights-empty" style={styles.empty}>Nothing logged in this window.</Text>
      ) : (
        <>
          <Card hero accent="credit" style={styles.hero}>
            <MonoTag tone="credit">period spend</MonoTag>
            <Text testID="insights-period-total" style={styles.total}>{formatMoney(model.stats.total)}</Text>
            <View style={styles.heroFooter}>
              <Text style={styles.caption}>{model.stats.count} {model.stats.count === 1 ? 'expense' : 'expenses'} · {model.stats.zeroSpendDays} quiet days</Text>
              {delta && delta.percent !== null ? <Text style={[styles.delta, delta.direction === 'down' ? styles.deltaGood : delta.direction === 'up' ? styles.deltaBad : styles.deltaFlat]}>{delta.percent > 0 ? '+' : ''}{Math.round(delta.percent)}%</Text> : null}
            </View>
          </Card>

          {model.days.filter((day) => day.count > 0).length < 3 ? <Text style={styles.thinData}>Trends become clearer after about a week.</Text> : null}

          <Text style={styles.section}>BY CATEGORY</Text>
          <Card style={styles.list}>
            {visible.map((row) => <CategoryRow key={row.categoryId} row={row} category={categoriesById.get(row.categoryId)} percent={percentageById.get(row.categoryId) ?? 0} period={period} />)}
            {collapsed.length > 0 ? <LongTail rows={collapsed} categoriesById={categoriesById} percentages={percentageById} period={period} /> : null}
          </Card>

          <Text style={styles.section}>BY DAY</Text>
          <Card style={styles.calendar}>
            <View style={styles.dayGrid}>
              {model.days.map((day) => {
                const intensity = intensityStep(day.total.minor, model.maximum);
                const fill = intensity === 1 ? styles.day1 : intensity === 2 ? styles.day2 : intensity === 3 ? styles.day3 : intensity === 4 ? styles.day4 : intensity === 5 ? styles.day5 : undefined;
                // Expo's generated route types refresh when Metro next starts; this
                // new route is intentionally kept as a concrete path meanwhile.
                const today = day.date === todayISO();
                return <Pressable key={day.date} testID={today ? 'insights-day-today' : `insights-day-${day.date}`} onPress={() => { haptic('tap'); router.push({ pathname: '/day/[date]' as never, params: { date: day.date, startDate: period.startDate, endDate: period.endDate } }); }} style={[styles.dayCell, fill, today && styles.todayCell]}><Text style={styles.dayText}>{day.date.slice(-2)}</Text></Pressable>;
              })}
            </View>
            <View style={styles.statRow}>
              <Stat label="AVG / DAY" value={formatMoney(model.stats.dailyAverage)} />
              <Stat label="BUSIEST" value={model.stats.busiestDay?.date.slice(5) ?? '—'} />
              <Stat label="QUIET" value={String(model.stats.zeroSpendDays)} />
            </View>
          </Card>

          <Text style={styles.section}>WEEKDAY PATTERN</Text>
          <Card style={styles.weekdays}>{model.weekdays.map((amount, index) => <View key={`${WEEKDAYS[index]}-${index}`} style={styles.weekday}><View style={[styles.weekdayBar, { height: Math.max(3, Math.round((amount.minor / model.maximumWeekday) * 48)) }]} /><Text style={styles.weekdayLabel}>{WEEKDAYS[index]}</Text></View>)}</Card>
        </>
      )}
    </ScrollView>
  );
}

function CategoryRow({ row, category, percent, period }: { row: ReturnType<typeof totalsByCategory>[number]; category: Category | undefined; percent: number; period: { startDate: string; endDate: string } }) {
  const tint = category ? categoryColors[category.colorToken].tint : colors.textMuted;
  return <Pressable testID={`insights-category-${row.categoryId}`} onPress={() => { haptic('tap'); router.push({ pathname: '/(tabs)/activity', params: { categoryId: row.categoryId, startDate: period.startDate, endDate: period.endDate } }); }} style={styles.categoryRow}><View style={styles.categoryTop}><MonoTag tint={tint}>{category?.name ?? 'Unknown'}</MonoTag><Text style={styles.amount}>{formatMoney(row.total)} · {percent}%</Text></View><View style={styles.track}><View style={[styles.bar, { backgroundColor: tint, width: `${Math.max(row.share * 100, 2)}%` }]} /></View></Pressable>;
}

function LongTail({ rows, categoriesById, percentages, period }: { rows: readonly ReturnType<typeof totalsByCategory>[number][]; categoriesById: ReadonlyMap<string, Category>; percentages: ReadonlyMap<string, number>; period: { startDate: string; endDate: string } }) {
  const [expanded, setExpanded] = useState(false);
  const total = rows.reduce((sum, row) => sum + row.total.minor, 0);
  return <View style={styles.longTail}><Pressable testID="insights-long-tail" onPress={() => { haptic('tap'); setExpanded((value) => !value); }}><Text style={styles.collapsed}>{expanded ? '−' : '+'} {rows.length} SMALL CATEGORIES · {formatMoney({ minor: total, currency: rows[0]!.total.currency })}</Text></Pressable>{expanded ? rows.map((row) => <CategoryRow key={row.categoryId} row={row} category={categoriesById.get(row.categoryId)} percent={percentages.get(row.categoryId) ?? 0} period={period} />) : null}</View>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: layout.screenMargin, gap: space.md }, eyebrow: { ...type.monoSm, color: colors.textMuted }, title: { ...type.headlineLg, color: colors.text, marginTop: 2 }, periodControl: { flexDirection: 'row', gap: space.xs }, periodChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 99, paddingHorizontal: space.sm, paddingVertical: space.xs }, periodChipActive: { backgroundColor: colors.credit, borderColor: colors.credit }, periodLabel: { ...type.monoSm, color: colors.textMuted }, periodLabelActive: { color: colors.onAccent }, navigator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, nav: { ...type.displayLg, color: colors.credit }, rangeBlock: { alignItems: 'center' }, range: { ...type.monoSm, color: colors.textMuted }, disabled: { color: colors.border }, hero: { gap: space.sm }, heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }, total: { ...type.displayLg, color: colors.credit }, caption: { ...type.bodyMd, color: colors.textMuted, flex: 1 }, delta: { ...type.monoMd, borderWidth: 1.5, borderRadius: 99, paddingHorizontal: space.sm, paddingVertical: 2 }, deltaGood: { color: colors.credit, borderColor: colors.credit }, deltaBad: { color: colors.debit, borderColor: colors.debit }, deltaFlat: { color: colors.textMuted, borderColor: colors.border }, thinData: { ...type.bodyMd, color: colors.textMuted }, section: { ...type.monoSm, color: colors.textMuted, marginTop: space.sm }, list: { gap: space.md }, categoryRow: { gap: space.xs }, categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }, amount: { ...type.monoSm, color: colors.text }, track: { height: 8, backgroundColor: colors.input, borderRadius: 99, overflow: 'hidden' }, bar: { height: '100%', borderRadius: 99 }, collapsed: { ...type.monoSm, color: colors.textMuted }, longTail: { gap: space.md }, calendar: { gap: space.md }, dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }, dayCell: { width: 32, height: 32, borderWidth: 1.5, borderColor: colors.border, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, todayCell: { borderColor: colors.credit }, dayText: { ...type.monoSm, color: colors.textMuted }, day1: { backgroundColor: '#315138' }, day2: { backgroundColor: '#46724b' }, day3: { backgroundColor: '#5a965a' }, day4: { backgroundColor: '#78bc63' }, day5: { backgroundColor: colors.credit }, statRow: { flexDirection: 'row', justifyContent: 'space-between' }, stat: { gap: 2, flex: 1 }, statLabel: { ...type.monoSm, color: colors.textMuted }, statValue: { ...type.monoSm, color: colors.text }, weekdays: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 82 }, weekday: { alignItems: 'center', justifyContent: 'flex-end', gap: space.xs, flex: 1, height: '100%' }, weekdayBar: { width: 12, backgroundColor: colors.credit, borderRadius: 3 }, weekdayLabel: { ...type.monoSm, color: colors.textMuted }, empty: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center', marginVertical: space['3xl'] }, error: { ...type.bodyMd, color: colors.debit },
});
