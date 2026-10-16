/**
 * Category and day views. Past days come from Function-maintained rollups,
 * this month from the offline-first expense cache, merged per Spend / Income /
 * Net view by mergePeriodSourcesForView (docs/05-insights.md § Spend, Income, Net).
 */

import {
  type Category,
  type InsightsView,
  type Money,
  type Period,
  type PeriodKind,
  addDays,
  categoryColors,
  collapseLongTail,
  colors,
  compareToPrevious,
  customPeriod,
  deltaTone,
  displayPercentages,
  formatMoney,
  intensityStep,
  isCurrentPeriod,
  layout,
  mergePeriodSourcesForView,
  periodOf,
  previousPeriod,
  savedCustomPeriod,
  space,
  todayISO,
  totalsByCategory,
  stepPeriod,
  type,
} from '@loop/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag } from '@/components/ui/surface';
import { DatePickerSheet } from '@/components/ui/date-picker-sheet';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useSettings } from '@/core/providers/settings-provider';
import { useCategories } from '@/features/categories';
import { EMPTY_STATES } from '@/lib/empty-states';
import { haptic } from '@/lib/haptics';

import { type ExpensesState, useExpensesForPeriod } from '../hooks/use-expenses';
import { useDailyRollups, useLedgerSchema } from '../hooks/use-rollups';
import { fromDrillDown } from '../model/ledger-filter';
import { useLedgerFilterStore } from '../state/ledger-filter-store';

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

/** The part of a period read from cached expenses: this month onward. Empty when wholly past. */
function cachedPart(period: Period, cacheFrom: string): Period {
  const startDate = period.startDate > cacheFrom ? period.startDate : cacheFrom;
  return { startDate, endDate: period.endDate > startDate ? period.endDate : startDate };
}

/** The part read from daily rollups: before this month. Null when nothing is that old. */
function rollupPart(period: Period, cacheFrom: string): Period | null {
  if (period.startDate >= cacheFrom) return null;
  return { startDate: period.startDate, endDate: period.endDate < cacheFrom ? period.endDate : cacheFrom };
}

/**
 * Every cached expense, synced or not. Insights must work fully offline
 * (docs/05, docs/11) and agree with Orbit and the ledger, which show unsynced
 * writes too. The cached part is this month only — past days come from
 * rollups — so an unsynced write can't be counted twice. ("Pending" in docs/05
 * means unapproved SMS items, a separate collection that never reaches here.)
 */
function cachedRecords(state: ExpensesState) {
  return state.status === 'ready' ? state.snapshot.expenses : [];
}

const PERIOD_LABEL: Record<PeriodKind, string> = { week: 'WEEK', month: 'MONTH', rolling30: '30 DAYS', custom: 'CUSTOM' };
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const VIEWS: readonly { readonly view: InsightsView; readonly label: string; readonly testID: string }[] = [
  { view: 'spend', label: 'SPEND', testID: 'insights-view-spend' },
  { view: 'income', label: 'INCOME', testID: 'insights-view-income' },
  { view: 'net', label: 'NET', testID: 'insights-view-net' },
];
const HERO_LABEL: Record<InsightsView, string> = { spend: 'period spend', income: 'period income', net: 'period net' };

export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const { settings, update } = useSettings();
  const [period, setPeriod] = useState(() => 
    settings.insightsPeriod === 'custom'
      ? savedCustomPeriod(settings, todayISO())
      : periodOf(settings.insightsPeriod, todayISO())
  );
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [view, setView] = useState<InsightsView>('spend');
  // Past days read rollups; this month reads the offline cache (docs/05-insights.md#data-sources).
  const cacheFrom = monthStart(todayISO());
  const previous = previousPeriod(period);
  const expenses = useExpensesForPeriod(cachedPart(period, cacheFrom));
  const rollups = useDailyRollups(rollupPart(period, cacheFrom));
  const previousExpenses = useExpensesForPeriod(cachedPart(previous, cacheFrom));
  const previousRollups = useDailyRollups(rollupPart(previous, cacheFrom));
  const categories = useCategories();
  // Until the v2 migration reaches this user, rollups may predate refunds and
  // income: past periods show a notice instead of numbers (docs/27).
  const ledger = useLedgerSchema();
  const historyUpdating = ledger.status === 'ready' && ledger.updating;

  const categoriesById = useMemo(
    () => new Map<string, Category>(categories.status === 'ready' ? categories.snapshot.categories.map((item) => [item.id, item]) : []),
    [categories],
  );
  const model = useMemo(() => {
    const merged = mergePeriodSourcesForView({
      period,
      currency: profile.currency,
      cacheFrom,
      rollups: rollups.status === 'ready' ? rollups.rollups : {},
      cached: cachedRecords(expenses),
    }, view);
    return {
      ...merged,
      maximum: Math.max(...merged.days.map((day) => day.total.minor), 0),
      maximumWeekday: Math.max(...merged.weekdays.map((value) => value.minor), 1),
    };
  }, [expenses, rollups, period, cacheFrom, profile.currency, view]);
  // A net-refund category (Spend view) sits under the chart, outside the 100% (docs/17).
  const positiveTotals = model.totals.filter((row) => row.total.minor > 0);
  const netRefunds = model.totals.filter((row) => row.total.minor < 0);
  const { visible, collapsed } = collapseLongTail(positiveTotals);
  const percentages = displayPercentages(model.totals);
  const percentageById = new Map(model.totals.map((row, index) => [row.categoryId, percentages[index] ?? 0]));
  const atPresent = isCurrentPeriod(period, todayISO());

  const changeKind = (kind: PeriodKind) => {
    if (kind === 'custom') {
      setShowCustomPicker(true);
    } else {
      haptic('selection');
      update({ insightsPeriod: kind });
      setPeriod(periodOf(kind, todayISO()));
    }
  };
  const changeView = (next: InsightsView) => {
    if (next === view) return;
    haptic('selection');
    setView(next);
  };
  const step = (direction: -1 | 1) => {
    if (direction === 1 && atPresent) return;
    haptic('selection');
    setPeriod((value) => stepPeriod(value, settings.insightsPeriod, direction, todayISO()));
  };

  const previousReady = previousExpenses.status === 'ready' && previousRollups.status !== 'loading' && previousRollups.status !== 'error';
  const previousTotal = previousReady
    ? mergePeriodSourcesForView({
        period: previous,
        currency: profile.currency,
        cacheFrom,
        rollups: previousRollups.status === 'ready' ? previousRollups.rollups : {},
        cached: cachedRecords(previousExpenses),
      }, view).total
    : null;
  const needsConnection = rollups.status === 'ready' && rollups.maybeUnfetched;

  // Dev-only render timing for the docs/05 budget (300ms at ~3,000 expenses):
  // mount to the first commit with every source ready. Read from logcat.
  const mountedAt = useRef(performance.now());
  const reported = useRef(false);
  const sourcesReady = expenses.status === 'ready' && rollups.status !== 'loading' && categories.status === 'ready';
  useEffect(() => {
    if (!__DEV__ || reported.current || !sourcesReady) return;
    reported.current = true;
    const cached = expenses.status === 'ready' ? expenses.snapshot.expenses.length : 0;
    console.log(`[perf] insights ready ${Math.round(performance.now() - mountedAt.current)}ms cached=${cached} rollupDays=${rollups.status === 'ready' ? Object.keys(rollups.rollups).length : 0}`);
  }, [sourcesReady, expenses, rollups]);
  const delta = previousTotal && !historyUpdating ? compareToPrevious(model.stats.total, previousTotal) : null;
  const tone = delta ? deltaTone(view, delta) : 'neutral';
  const netNegative = view === 'net' && model.stats.total.minor < 0;

  const customLabel = useMemo(() => {
    if (settings.insightsPeriod !== 'custom' || !settings.insightsCustomStartDate || !settings.insightsCustomEndDate) {
      return 'CUSTOM';
    }
    const start = settings.insightsCustomStartDate;
    const endInclusive = addDays(settings.insightsCustomEndDate, -1);
    const formatDay = (date: string) => {
      const [, m, d] = date.split('-');
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return `${d} ${months[parseInt(m, 10) - 1]}`;
    };
    return `${formatDay(start)} – ${formatDay(endInclusive)}`;
  }, [settings.insightsPeriod, settings.insightsCustomStartDate, settings.insightsCustomEndDate]);

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
            <Text 
              testID={kind === 'custom' ? 'insights-custom-label' : undefined}
              style={[styles.periodLabel, settings.insightsPeriod === kind && styles.periodLabelActive]}>
              {kind === 'custom' ? customLabel : PERIOD_LABEL[kind]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.periodControl} accessibilityRole="tablist">
        {VIEWS.map((item) => (
          <Pressable
            key={item.view}
            testID={item.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === item.view }}
            onPress={() => changeView(item.view)}
            style={[styles.periodChip, view === item.view && styles.periodChipActive]}>
            <Text style={[styles.periodLabel, view === item.view && styles.periodLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.navigator}>
        <Pressable testID="insights-previous" accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => step(-1)} hitSlop={10}><Text style={styles.nav}>‹</Text></Pressable>
        <View style={styles.rangeBlock}><Text testID="insights-period-current" style={styles.range}>{settings.insightsPeriod === 'custom' ? customLabel : PERIOD_LABEL[settings.insightsPeriod]}</Text><Text style={styles.range}>{period.startDate} — {addDays(period.endDate, -1)}</Text></View>
        <Pressable testID="insights-next" accessibilityRole="button" accessibilityLabel="Next period" onPress={() => step(1)} disabled={atPresent} hitSlop={10}><Text style={[styles.nav, atPresent && styles.disabled]}>›</Text></Pressable>
      </View>

      {expenses.status === 'loading' || rollups.status === 'loading' ? <Text style={styles.empty}>Loading your spending…</Text> : null}
      {expenses.status === 'error' ? <Text style={styles.error}>{expenses.message}</Text> : null}
      {rollups.status === 'error' ? <Text style={styles.error}>{rollups.message}</Text> : null}
      {needsConnection ? <Text testID="insights-needs-connection" style={styles.thinData}>Needs a connection once.</Text> : null}
      {historyUpdating && rollupPart(period, cacheFrom) !== null ? (
        <Text testID="insights-updating-history" style={styles.empty}>{EMPTY_STATES.insightsUpdatingHistory}</Text>
      ) : expenses.status === 'ready' && rollups.status !== 'loading' && model.stats.count === 0 ? (
        <Text testID="insights-empty" style={styles.empty}>{EMPTY_STATES.insights}</Text>
      ) : (
        <>
          <Card hero accent="credit" style={styles.hero}>
            <MonoTag tone="credit">{HERO_LABEL[view]}</MonoTag>
            <Text testID="insights-period-total" style={[styles.total, netNegative && styles.totalNegative]}>{formatMoney(model.stats.total)}</Text>
            <View style={styles.heroFooter}>
              <Text style={styles.caption}>{model.stats.count} {view === 'spend' ? (model.stats.count === 1 ? 'expense' : 'expenses') : model.stats.count === 1 ? 'entry' : 'entries'}{view === 'spend' ? ` · ${model.stats.zeroSpendDays} quiet days` : ''}</Text>
              {delta && delta.percent !== null ? <Text testID="insights-delta" style={[styles.delta, tone === 'good' ? styles.deltaGood : tone === 'bad' ? styles.deltaBad : styles.deltaFlat]}>{delta.percent > 0 ? '+' : ''}{Math.round(delta.percent)}%</Text> : null}
            </View>
          </Card>

          {model.days.filter((day) => day.count > 0).length < 3 ? <Text style={styles.thinData}>{EMPTY_STATES.insightsThinData}</Text> : null}

          <Text style={styles.section}>{view === 'net' ? 'IN AND OUT' : 'BY CATEGORY'}</Text>
          {view === 'net' ? (
            <Card style={styles.list}><InOutBars totals={model.totals} currency={profile.currency} /></Card>
          ) : (
            <Card style={styles.list}>
              {visible.map((row) => <CategoryRow key={row.categoryId} row={row} category={categoriesById.get(row.categoryId)} percent={percentageById.get(row.categoryId) ?? 0} period={period} />)}
              {collapsed.length > 0 ? <LongTail rows={collapsed} categoriesById={categoriesById} percentages={percentageById} period={period} /> : null}
              {netRefunds.map((row) => <NetRefundRow key={row.categoryId} row={row} category={categoriesById.get(row.categoryId)} />)}
            </Card>
          )}

          <Text style={styles.section}>BY DAY</Text>
          <Card style={styles.calendar}>
            <View style={styles.dayGrid}>
              {model.days.map((day) => {
                const intensity = intensityStep(day.total.minor, model.maximum);
                const fill = intensity === 1 ? styles.day1 : intensity === 2 ? styles.day2 : intensity === 3 ? styles.day3 : intensity === 4 ? styles.day4 : intensity === 5 ? styles.day5 : undefined;
                // Expo's generated route types refresh when Metro next starts; this
                // new route is intentionally kept as a concrete path meanwhile.
                const today = day.date === todayISO();
                return <Pressable key={day.date} testID={today ? 'insights-day-today' : `insights-day-${day.date}`} accessibilityRole="button" accessibilityLabel={`${day.date}, ${formatMoney(day.total)}`} onPress={() => { haptic('tap'); router.push({ pathname: '/day/[date]' as never, params: { date: day.date, startDate: period.startDate, endDate: period.endDate } }); }} style={[styles.dayCell, fill, today && styles.todayCell]}><Text style={styles.dayText}>{day.date.slice(-2)}</Text></Pressable>;
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

      {showCustomPicker ? (
        <DatePickerSheet
          mode="range"
          value={{
            start: settings.insightsCustomStartDate ?? addDays(todayISO(), -29),
            end: addDays(settings.insightsCustomEndDate ?? todayISO(), -1),
          }}
          onChange={(value) => {
            const range = value as { start: string; end: string };
            const endExclusive = addDays(range.end, 1);
            let newPeriod;
            try {
              newPeriod = customPeriod(range.start, endExclusive, todayISO());
            } catch {
              // The sheet caps ranges at 366 days and the past, so this only
              // trips if today changed while it was open. Keep it open.
              haptic('warning');
              return;
            }
            setPeriod(newPeriod);
            update({
              insightsPeriod: 'custom',
              insightsCustomStartDate: range.start,
              insightsCustomEndDate: endExclusive,
            });
            haptic('selection');
            setShowCustomPicker(false);
          }}
          onCancel={() => setShowCustomPicker(false)}
          allowFuture={false}
          maxRangeDays={366}
        />
      ) : null}
    </ScrollView>
  );
}

function CategoryRow({ row, category, percent, period }: { row: ReturnType<typeof totalsByCategory>[number]; category: Category | undefined; percent: number; period: { startDate: string; endDate: string } }) {
  const tint = category ? categoryColors[category.colorToken].tint : colors.textMuted;
  return <Pressable testID={`insights-category-${row.categoryId}`} accessibilityRole="button" accessibilityLabel={`${category?.name ?? 'Unknown'}, ${formatMoney(row.total)}, ${percent}%`} onPress={() => { haptic('tap'); useLedgerFilterStore.getState().setFilter(fromDrillDown({ categoryId: row.categoryId, startDate: period.startDate, endDate: period.endDate })); router.push('/(tabs)/activity'); }} style={styles.categoryRow}><View style={styles.categoryTop}><MonoTag tint={tint}>{category?.name ?? 'Unknown'}</MonoTag><View style={styles.amountGroup}><Text style={styles.amount}>{formatMoney(row.total)}</Text><Text style={styles.amount}>{`· ${percent}%`}</Text></View></View><View style={styles.track}><View style={[styles.bar, { backgroundColor: tint, width: `${Math.max(row.share * 100, 2)}%` }]} /></View></Pressable>;
}

function LongTail({ rows, categoriesById, percentages, period }: { rows: readonly ReturnType<typeof totalsByCategory>[number][]; categoriesById: ReadonlyMap<string, Category>; percentages: ReadonlyMap<string, number>; period: { startDate: string; endDate: string } }) {
  const [expanded, setExpanded] = useState(false);
  const total = rows.reduce((sum, row) => sum + row.total.minor, 0);
  return <View style={styles.longTail}><Pressable testID="insights-long-tail" accessibilityRole="button" accessibilityLabel={`${rows.length} small categories`} accessibilityState={{ expanded }} onPress={() => { haptic('tap'); setExpanded((value) => !value); }}><Text style={styles.collapsed}>{expanded ? '−' : '+'} {rows.length} SMALL CATEGORIES · {formatMoney({ minor: total, currency: rows[0]!.total.currency })}</Text></Pressable>{expanded ? rows.map((row) => <CategoryRow key={row.categoryId} row={row} category={categoriesById.get(row.categoryId)} percent={percentages.get(row.categoryId) ?? 0} period={period} />) : null}</View>;
}

/** A category whose refunds outweigh its spend this period: no bar, lime amount, never clamped (docs/17). */
function NetRefundRow({ row, category }: { row: ReturnType<typeof totalsByCategory>[number]; category: Category | undefined }) {
  const tint = category ? categoryColors[category.colorToken].tint : colors.textMuted;
  return <View testID={`insights-net-refund-${row.categoryId}`} accessible accessibilityLabel={`${category?.name ?? 'Unknown'}, net refund ${formatMoney(row.total)}`} style={styles.categoryTop}><View style={styles.amountGroup}><MonoTag tint={tint}>{category?.name ?? 'Unknown'}</MonoTag><MonoTag tone="credit">refund</MonoTag></View><View style={styles.amountGroup}><Text style={styles.refundAmount}>{formatMoney(row.total)}</Text><Text style={styles.caption}>net refund</Text></View></View>;
}

/** Net view: two bars, money in and money out, scaled to the larger. */
function InOutBars({ totals, currency }: { totals: readonly ReturnType<typeof totalsByCategory>[number][]; currency: Money['currency'] }) {
  const inMinor = totals.find((row) => row.categoryId === 'in')?.total.minor ?? 0;
  const outMinor = totals.find((row) => row.categoryId === 'out')?.total.minor ?? 0;
  const scale = Math.max(Math.abs(inMinor), Math.abs(outMinor), 1);
  const bar = (label: string, minor: number, color: string, testID: string) => (
    <View testID={testID} accessible accessibilityLabel={`${label}, ${formatMoney({ minor, currency })}`} style={styles.categoryRow}>
      <View style={styles.categoryTop}><MonoTag tint={color}>{label}</MonoTag><Text style={styles.amount}>{formatMoney({ minor, currency })}</Text></View>
      <View style={styles.track}><View style={[styles.bar, { backgroundColor: color, width: `${Math.max((Math.max(minor, 0) / scale) * 100, 2)}%` }]} /></View>
    </View>
  );
  return <>{bar('IN', inMinor, colors.credit, 'insights-net-in')}{bar('OUT', outMinor, colors.debit, 'insights-net-out')}</>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: layout.screenMargin, gap: space.md }, eyebrow: { ...type.monoSm, color: colors.textMuted }, title: { ...type.headlineLg, color: colors.text, marginTop: 2 }, periodControl: { flexDirection: 'row', gap: space.xs }, periodChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 99, paddingHorizontal: space.sm, paddingVertical: space.xs }, periodChipActive: { backgroundColor: colors.credit, borderColor: colors.credit }, periodLabel: { ...type.monoSm, color: colors.textMuted }, periodLabelActive: { color: colors.onAccent }, navigator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, nav: { ...type.displayLg, color: colors.credit }, rangeBlock: { alignItems: 'center' }, range: { ...type.monoSm, color: colors.textMuted }, disabled: { color: colors.border }, hero: { gap: space.sm }, heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }, total: { ...type.displayLg, color: colors.credit }, totalNegative: { color: colors.debit }, refundAmount: { ...type.monoSm, color: colors.credit }, caption: { ...type.bodyMd, color: colors.textMuted, flex: 1 }, delta: { ...type.monoMd, borderWidth: 1.5, borderRadius: 99, paddingHorizontal: space.sm, paddingVertical: 2 }, deltaGood: { color: colors.credit, borderColor: colors.credit }, deltaBad: { color: colors.debit, borderColor: colors.debit }, deltaFlat: { color: colors.textMuted, borderColor: colors.border }, thinData: { ...type.bodyMd, color: colors.textMuted }, section: { ...type.monoSm, color: colors.textMuted, marginTop: space.sm }, list: { gap: space.md }, categoryRow: { gap: space.xs }, categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }, amount: { ...type.monoSm, color: colors.text },
  // Amount and percentage as separate runs with no breakable space: on Android
  // the mono font's letterSpacing plus the fallback ₹ glyph under-measures the
  // line, and a single "₹100.00 · 67%" wrapped its percentage out of view.
  amountGroup: { flexDirection: 'row', gap: space.xs }, track: { height: 8, backgroundColor: colors.input, borderRadius: 99, overflow: 'hidden' }, bar: { height: '100%', borderRadius: 99 }, collapsed: { ...type.monoSm, color: colors.textMuted }, longTail: { gap: space.md }, calendar: { gap: space.md }, dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }, dayCell: { width: 32, height: 32, borderWidth: 1.5, borderColor: colors.border, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, todayCell: { borderColor: colors.credit }, dayText: { ...type.monoSm, color: colors.textMuted }, day1: { backgroundColor: '#315138' }, day2: { backgroundColor: '#46724b' }, day3: { backgroundColor: '#5a965a' }, day4: { backgroundColor: '#78bc63' }, day5: { backgroundColor: colors.credit }, statRow: { flexDirection: 'row', justifyContent: 'space-between' }, stat: { gap: 2, flex: 1 }, statLabel: { ...type.monoSm, color: colors.textMuted }, statValue: { ...type.monoSm, color: colors.text }, weekdays: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 82 }, weekday: { alignItems: 'center', justifyContent: 'flex-end', gap: space.xs, flex: 1, height: '100%' }, weekdayBar: { width: 12, backgroundColor: colors.credit, borderRadius: 3 }, weekdayLabel: { ...type.monoSm, color: colors.textMuted }, empty: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center', marginVertical: space['3xl'] }, error: { ...type.bodyMd, color: colors.debit },
});
