/**
 * The full ledger: newest first, grouped by local day, searchable, paged.
 * See docs/03-expenses.md#the-ledger.
 */

import { type Category, colors, formatMoney, layout, radius, space, todayISO, type } from '@loop/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories';

import { ExpenseRow } from '../components/expense-row';
import { useRecentExpenses } from '../hooks/use-expenses';
import { dayLabel, groupByDay, searchExpenses } from '../model/ledger';

const PAGE = 50;

export function LedgerScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const [pageSize, setPageSize] = useState(PAGE);
  const [search, setSearch] = useState('');
  const expenses = useRecentExpenses(pageSize);
  const categoriesState = useCategories();

  const categoriesById = useMemo(
    () =>
      new Map<string, Category>(
        categoriesState.status === 'ready' ? categoriesState.snapshot.categories.map((c) => [c.id, c]) : [],
      ),
    [categoriesState],
  );

  const sections = useMemo(() => {
    if (expenses.status !== 'ready') return [];
    const matched = searchExpenses(expenses.snapshot.expenses, search, categoriesById);
    return groupByDay(matched, profile.currency).map((day) => ({ ...day, data: [...day.expenses] }));
  }, [expenses, search, categoriesById, profile.currency]);

  const today = todayISO();
  const loaded = expenses.status === 'ready' ? expenses.snapshot.expenses.length : 0;

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
          // Only ask for more when the last page came back full.
          if (loaded >= pageSize) setPageSize((size) => size + PAGE);
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>LEDGER</Text>
            <Text style={styles.title}>Activity</Text>
            <TextInput
              testID="ledger-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search descriptions and categories"
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              returnKeyType="search"
            />
            {expenses.status === 'ready' && expenses.snapshot.fromCache ? <MonoTag>offline</MonoTag> : null}
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
            pending={expenses.status === 'ready' && expenses.snapshot.pendingIds.has(item.id)}
            onPress={() => router.push({ pathname: '/expense/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          expenses.status === 'loading' ? null : expenses.status === 'error' ? (
            <Text style={styles.empty}>{expenses.message}</Text>
          ) : search ? (
            <Text style={styles.empty} testID="ledger-no-results">
              Nothing matches "{search}".
            </Text>
          ) : (
            <View style={styles.emptyState} testID="ledger-empty">
              <Text style={styles.empty}>Your ledger starts here.</Text>
              <TactileButton label="Log an expense" onPress={() => router.push('/expense/new')} />
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
  search: {
    ...type.bodyMd,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.sm + 2,
    marginTop: space.xs,
  },
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
