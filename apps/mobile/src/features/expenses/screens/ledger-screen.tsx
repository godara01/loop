/**
 * The full ledger: newest first, grouped by local day, filtered, paged.
 * See docs/03-expenses.md#the-ledger and § "Ledger filters" → In the ledger.
 *
 * The filter lives in the session store, not in route params: the sheet at
 * `/ledger/filter` and the Insights drill-downs both write it, and the ledger
 * only reads it. Route params are still accepted once, for drill-downs built
 * before the store existed and for a deep link, then cleared so a reload cannot
 * re-apply a filter the user has since removed.
 *
 * Which rows a filter produces, and how its summary reads, are decided by pure
 * functions in ../model (`ledgerSource`, `ledgerSummary`, `summaryLine`,
 * `scannedBackLabel`) — this screen only lays them out.
 */

import { type Category, colors, formatMoney, layout, radius, space, todayISO, type } from '@loop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories';
import { EMPTY_STATES } from '@/lib/empty-states';
import { haptic } from '@/lib/haptics';

import { ExpenseRow } from '../components/expense-row';
import { useFilteredLedger } from '../hooks/use-filtered-ledger';
import { dayLabel, groupByDay } from '../model/ledger';
import { type FilterFacet, activeChips, fromDrillDown, isEmpty, matches } from '../model/ledger-filter';
import { ledgerSource, ledgerSummary, scannedBackLabel, summaryLine } from '../model/ledger-view';
import { useLedgerFilterStore } from '../state/ledger-filter-store';

const PAGE = 50;

/**
 * Spelled out rather than built with a template so `check:testids` can see
 * them, and an e2e flow can name one without an allowlist entry.
 */
const CHIP_TEST_IDS: Record<FilterFacet, string> = {
  text: 'ledger-chip-text',
  dateRange: 'ledger-chip-dateRange',
  categoryIds: 'ledger-chip-categoryIds',
  amount: 'ledger-chip-amount',
  sources: 'ledger-chip-sources',
  kinds: 'ledger-chip-kinds',
  accountIds: 'ledger-chip-accountIds',
  tagIds: 'ledger-chip-tagIds',
  merchantKey: 'ledger-chip-merchantKey',
};

export function LedgerScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const params = useLocalSearchParams<{ categoryId?: string; date?: string; startDate?: string; endDate?: string }>();
  const [pageSize, setPageSize] = useState(PAGE);
  const filter = useLedgerFilterStore((state) => state.filter);
  const setText = useLedgerFilterStore((state) => state.set);
  const setFilter = useLedgerFilterStore((state) => state.setFilter);
  const clear = useLedgerFilterStore((state) => state.clear);
  const removeFacet = useLedgerFilterStore((state) => state.removeFacet);
  const categoriesState = useCategories();

  // A pre-store drill-down: adopt its params once, then drop them from the URL.
  const adoptedParams = useRef(false);
  const { categoryId, date, startDate, endDate } = params;
  useEffect(() => {
    if (adoptedParams.current) return;
    if (!categoryId && !date && !startDate && !endDate) return;
    adoptedParams.current = true;
    setFilter(fromDrillDown({ categoryId, date, startDate, endDate }));
    router.setParams({ categoryId: undefined, date: undefined, startDate: undefined, endDate: undefined });
  }, [categoryId, date, startDate, endDate, setFilter]);

  const categoriesById = useMemo(
    () =>
      new Map<string, Category>(
        categoriesState.status === 'ready' ? categoriesState.snapshot.categories.map((c) => [c.id, c]) : [],
      ),
    [categoriesState],
  );
  const ctx = useMemo(() => ({ categoriesById }), [categoriesById]);

  const expenses = useFilteredLedger(filter, ctx, pageSize);
  const filtered = !isEmpty(filter);
  const source = ledgerSource(filter);
  const chips = useMemo(
    () => activeChips(filter, { categoriesById, currency: profile.currency }),
    [filter, categoriesById, profile.currency],
  );

  const matched = useMemo(
    () => (expenses.status === 'ready' ? expenses.expenses.filter((e) => matches(filter, e, ctx)) : []),
    [expenses, filter, ctx],
  );
  const sections = useMemo(
    () => groupByDay(matched, profile.currency).map((day) => ({ ...day, data: [...day.expenses] })),
    [matched, profile.currency],
  );

  const complete = expenses.status === 'ready' ? expenses.complete : true;
  const summary = useMemo(() => ledgerSummary(matched, profile.currency, complete), [matched, profile.currency, complete]);
  const scannedBack = expenses.status === 'ready' && !complete ? scannedBackLabel(expenses.scannedBackTo) : null;
  const loadMore = expenses.status === 'ready' ? expenses.loadMore : null;

  const today = todayISO();
  const loaded = expenses.status === 'ready' ? expenses.expenses.length : 0;

  return (
    <View style={styles.screen} testID="screen-ledger">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.base, paddingBottom: 160 }]}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          // Only the live list grows by page size; a scan grows through Load more.
          if (source.kind === 'recent' && loaded >= pageSize) setPageSize((size) => size + PAGE);
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>LEDGER</Text>
            <Text style={styles.title}>Activity</Text>
            <View style={styles.searchRow}>
              <TextInput
                testID="ledger-search"
                value={filter.text}
                onChangeText={(text) => setText({ text })}
                placeholder="Search descriptions and categories"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
                returnKeyType="search"
              />
              <TactileButton
                testID="ledger-filter-open"
                variant="secondary"
                label={chips.length > 0 ? `Filter, ${chips.length} active` : 'Filter'}
                style={styles.filterButton}
                // The route exists (app/ledger/filter.tsx); the generated types
                // only pick it up after the next `expo start` typegen run.
                onPress={() => router.push('/ledger/filter' as never)}>
                <View style={styles.filterButtonInner}>
                  <Text style={styles.filterButtonLabel}>Filter</Text>
                  {chips.length > 0 ? <Text style={styles.filterCount}>{chips.length}</Text> : null}
                </View>
              </TactileButton>
            </View>
            {chips.length > 0 ? (
              <View style={styles.chipRow}>
                {chips.map((chip) => (
                  <Pressable
                    key={chip.facet}
                    testID={CHIP_TEST_IDS[chip.facet]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove filter ${chip.label}`}
                    onPress={() => {
                      haptic('selection');
                      removeFacet(chip.facet);
                    }}
                    style={styles.chip}>
                    <Text style={styles.chipLabel}>{chip.label}</Text>
                    <Text style={styles.chipRemove}>✕</Text>
                  </Pressable>
                ))}
                <Pressable
                  testID="ledger-clear-filter"
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                  onPress={() => {
                    haptic('selection');
                    clear();
                  }}
                  style={styles.clearAll}>
                  <Text style={styles.clearAllLabel}>Clear all</Text>
                </Pressable>
              </View>
            ) : null}
            {filtered && expenses.status === 'ready' ? (
              <Text style={styles.summary} testID="ledger-summary">
                {summaryLine(summary)}
              </Text>
            ) : null}
            {expenses.status === 'ready' && expenses.fromCache ? <MonoTag>offline</MonoTag> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader} testID={`ledger-day-${section.date}`}>
            <Text style={styles.dayLabel}>{dayLabel(section.date, today).toUpperCase()}</Text>
            <Text style={styles.dayTotal} testID={`ledger-day-${section.date}-total`}>
              {formatMoney(section.total)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ExpenseRow
            expense={item}
            category={categoriesById.get(item.categoryId)}
            pending={expenses.status === 'ready' && expenses.pendingIds.has(item.id)}
            onPress={() => router.push({ pathname: '/expense/[id]', params: { id: item.id } })}
          />
        )}
        ListFooterComponent={
          scannedBack === null ? null : (
            <View style={styles.footer}>
              <Text style={styles.scannedBack} testID="ledger-scanned-back">
                {scannedBack}
              </Text>
              {loadMore === null ? null : (
                <TactileButton
                  testID="ledger-load-more"
                  variant="secondary"
                  label={expenses.status === 'ready' && expenses.loadingMore ? 'Loading…' : 'Load more'}
                  disabled={expenses.status === 'ready' && expenses.loadingMore}
                  onPress={loadMore}
                />
              )}
            </View>
          )
        }
        ListEmptyComponent={
          expenses.status === 'loading' ? null : expenses.status === 'error' ? (
            <Text style={styles.empty}>{expenses.message}</Text>
          ) : filtered ? (
            <View style={styles.emptyState} testID="ledger-no-results">
              <Text style={styles.empty}>Nothing matches these filters.</Text>
              <TactileButton
                testID="ledger-no-results-clear"
                variant="secondary"
                label="Clear all"
                onPress={() => clear()}
              />
            </View>
          ) : (
            <View style={styles.emptyState} testID="ledger-empty">
              <Text style={styles.empty}>{EMPTY_STATES.ledger}</Text>
              <TactileButton testID="ledger-empty-add" label="Log an expense" onPress={() => router.push('/expense/new')} />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin },
  header: { gap: space.sm, marginBottom: space.md },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  search: {
    ...type.bodyMd,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.sm + 2,
  },
  filterButton: { flexShrink: 0 },
  filterButtonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filterButtonLabel: { ...type.headlineSm, color: colors.text },
  filterCount: { ...type.monoSm, color: colors.credit },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.chipActive,
    borderColor: colors.social,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chipLabel: { ...type.monoSm, color: colors.text },
  chipRemove: { ...type.monoSm, color: colors.textMuted },
  clearAll: { paddingHorizontal: space.md, paddingVertical: space.xs },
  clearAllLabel: { ...type.monoSm, color: colors.textMuted, textDecorationLine: 'underline' },
  summary: { ...type.monoMd, color: colors.text },
  footer: { gap: space.md, alignItems: 'center', marginTop: space.lg },
  scannedBack: { ...type.monoSm, color: colors.textMuted, textAlign: 'center' },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingTop: space.base,
    paddingBottom: space.xs,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
  },
  dayLabel: { ...type.monoSm, color: colors.textMuted },
  dayTotal: { ...type.monoMd, color: colors.text },
  empty: { ...type.bodyLg, color: colors.textMuted, textAlign: 'center' },
  emptyState: { gap: space.lg, marginTop: space['3xl'] },
});
