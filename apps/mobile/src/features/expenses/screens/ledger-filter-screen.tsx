/**
 * The ledger filter sheet (`/ledger/filter`). See docs/03-expenses.md
 * § "The filter sheet".
 *
 * It edits a **draft** copy of the session filter and only writes it on Apply,
 * so backing out of the sheet leaves the ledger exactly as it was. The amount
 * bounds live as typed text and become minor units through `parseAmount` — text
 * we cannot read is ignored with an inline note rather than silently coerced,
 * and no amount is ever a float.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type Category,
  type CurrencyCode,
  type ExpenseSource,
  type TransactionKind,
  categoryColors,
  colors,
  layout,
  parseAmount,
  radius,
  space,
  todayISO,
  type,
} from '@loop/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerSheet } from '@/components/ui/date-picker-sheet';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useAccounts } from '@/features/accounts/hooks/use-accounts';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { inputFromMoney } from '../model/amount-input';
import { PRESET_IDS, PRESET_LABELS, type DatePresetId, last30, matchingPreset, presetRange } from '../model/date-presets';
import { EMPTY_FILTER, KIND_LABELS, type LedgerFilter, validate } from '../model/ledger-filter';
import { useLedgerFilterStore } from '../state/ledger-filter-store';

/** The sources the sheet offers in P1; `shared` and `group` arrive with Squads. */
const SOURCES: readonly { readonly id: Extract<ExpenseSource, 'manual' | 'sms'>; readonly label: string; readonly testID: string }[] = [
  { id: 'manual', label: 'Manual', testID: 'ledger-filter-source-manual' },
  { id: 'sms', label: 'SMS', testID: 'ledger-filter-source-sms' },
];

/** v1.2 kinds, ids spelled out for check:testids. */
const KINDS: readonly { readonly id: TransactionKind; readonly testID: string }[] = [
  { id: 'expense', testID: 'ledger-filter-kind-expense' },
  { id: 'income', testID: 'ledger-filter-kind-income' },
  { id: 'refund', testID: 'ledger-filter-kind-refund' },
  { id: 'transfer', testID: 'ledger-filter-kind-transfer' },
];

/**
 * Spelled out rather than built with a template so `check:testids` can see
 * them, and an e2e flow can name one without an allowlist entry.
 */
const PRESET_TEST_IDS: Record<DatePresetId, string> = {
  'this-month': 'ledger-filter-preset-this-month',
  'last-month': 'ledger-filter-preset-last-month',
  'last-30': 'ledger-filter-preset-last-30',
  'this-year': 'ledger-filter-preset-this-year',
  custom: 'ledger-filter-preset-custom',
};

interface AmountField {
  /** Minor units, or null when the field is empty or unreadable. */
  readonly minor: number | null;
  readonly invalid: boolean;
}

/** An empty bound means "no bound"; unreadable text is reported, not guessed. */
function amountField(text: string, currency: CurrencyCode): AmountField {
  if (text.trim() === '') return { minor: null, invalid: false };
  const parsed = parseAmount(text, currency);
  // A negative bound can never match: every expense total is above zero.
  if (parsed === null || parsed.minor < 0) return { minor: null, invalid: true };
  return { minor: parsed.minor, invalid: false };
}

/** Pre-fills a bound exactly, through the pad's own minor-units formatter. */
function amountText(minor: number | null, currency: CurrencyCode): string {
  return minor === null ? '' : inputFromMoney({ minor, currency }).text;
}

const toggled = <T,>(values: readonly T[], value: T): readonly T[] =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

/** The one note under the amount row: the range error outranks unreadable text. */
function amountNoteFor(rangeOk: boolean, min: AmountField, max: AmountField): string | null {
  if (!rangeOk) return 'Min is more than max';
  if (min.invalid && max.invalid) return "Ignoring both amounts — they aren't numbers";
  if (min.invalid) return "Ignoring the min — that isn't a number";
  if (max.invalid) return "Ignoring the max — that isn't a number";
  return null;
}

export function LedgerFilterScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const currency = profile.currency;
  const stored = useLedgerFilterStore((state) => state.filter);
  const setFilter = useLedgerFilterStore((state) => state.setFilter);
  const categoriesState = useCategories();
  const accountsState = useAccounts();
  // Archived accounts stay filterable, the way archived categories do.
  const accounts = accountsState.status === 'ready' ? accountsState.snapshot.accounts : [];

  const [draft, setDraft] = useState<LedgerFilter>(stored);
  const [minText, setMinText] = useState(() => amountText(stored.amountMin, currency));
  const [maxText, setMaxText] = useState(() => amountText(stored.amountMax, currency));
  const [showPicker, setShowPicker] = useState(false);

  const today = todayISO();
  const activePreset = matchingPreset(draft.dateRange, today);

  const { active, archived } = useMemo(() => {
    const all: readonly Category[] = categoriesState.status === 'ready' ? categoriesState.snapshot.categories : [];
    const bySortOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder;
    return {
      active: all.filter((c) => c.archivedAt === null).sort(bySortOrder),
      archived: all.filter((c) => c.archivedAt !== null).sort(bySortOrder),
    };
  }, [categoriesState]);

  const min = amountField(minText, currency);
  const max = amountField(maxText, currency);
  const candidate: LedgerFilter = { ...draft, amountMin: min.minor, amountMax: max.minor };
  const result = validate(candidate);
  const amountNote = amountNoteFor(result.ok, min, max);

  /** Tapping the live preset clears the date facet: an empty range means "all dates". */
  const pickPreset = (id: DatePresetId) => {
    haptic('selection');
    if (id === 'custom') {
      setShowPicker(true);
      return;
    }
    setDraft((current) => ({ ...current, dateRange: activePreset === id ? null : presetRange(id, today) }));
  };

  const toggleCategory = (categoryId: string) => {
    haptic('selection');
    setDraft((current) => ({ ...current, categoryIds: toggled(current.categoryIds, categoryId) }));
  };

  const toggleSource = (source: ExpenseSource) => {
    haptic('selection');
    setDraft((current) => ({ ...current, sources: toggled(current.sources, source) }));
  };

  const toggleKind = (kind: TransactionKind) => {
    haptic('selection');
    setDraft((current) => ({ ...current, kinds: toggled(current.kinds, kind) }));
  };

  const toggleAccount = (accountId: string | 'none') => {
    haptic('selection');
    setDraft((current) => ({ ...current, accountIds: toggled(current.accountIds, accountId) }));
  };

  const reset = () => {
    // The search field belongs to the ledger, not to this sheet, so it survives.
    setDraft({ ...EMPTY_FILTER, text: draft.text });
    setMinText('');
    setMaxText('');
  };

  const apply = () => {
    if (!result.ok) return;
    setFilter(candidate);
    router.back();
  };

  const renderCategory = (category: Category) => {
    const selected = candidate.categoryIds.includes(category.id);
    const { tint, onTint } = categoryColors[category.colorToken];
    return (
      <Pressable
        key={category.id}
        testID={`ledger-filter-category-${category.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={category.name}
        onPress={() => toggleCategory(category.id)}
        style={[styles.tag, { borderColor: selected ? colors.credit : tint }, selected && styles.tagSelected]}>
        <Text style={[styles.tagLabel, { color: selected ? onTint : tint }]}>{category.slug}</Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + space.sm }]}
      // Matches the entry screen: `edgeToEdgeEnabled` means Android's window
      // resize can't be relied on to keep Apply above the keyboard.
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      keyboardVerticalOffset={insets.top}
      testID="ledger-filter-screen">
      <View style={styles.header}>
        <Pressable testID="ledger-filter-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>FILTERS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.section}>DATE</Text>
        <View style={styles.chipRow}>
          {[...PRESET_IDS, 'custom' as const].map((id) => {
            const selected = activePreset === id;
            return (
              <Pressable
                key={id}
                testID={PRESET_TEST_IDS[id]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={PRESET_LABELS[id]}
                onPress={() => pickPreset(id)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{PRESET_LABELS[id]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.rangeLine} testID="ledger-filter-range">
          {draft.dateRange === null ? 'All dates' : `${draft.dateRange.start} → ${draft.dateRange.end}`}
        </Text>

        <Text style={styles.section}>CATEGORY</Text>
        {categoriesState.status === 'error' ? <Text style={styles.note}>{categoriesState.message}</Text> : null}
        <View style={styles.chipRow}>{active.map(renderCategory)}</View>
        {archived.length > 0 ? (
          <>
            <Text style={styles.subSection}>ARCHIVED</Text>
            <View style={[styles.chipRow, styles.archived]}>{archived.map(renderCategory)}</View>
          </>
        ) : null}

        <Text style={styles.section}>AMOUNT</Text>
        <View style={styles.amountRow}>
          <TextInput
            testID="ledger-filter-amount-min"
            accessibilityLabel="Minimum amount"
            value={minText}
            onChangeText={setMinText}
            placeholder="Min"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, min.invalid && styles.inputInvalid]}
          />
          <TextInput
            testID="ledger-filter-amount-max"
            accessibilityLabel="Maximum amount"
            value={maxText}
            onChangeText={setMaxText}
            placeholder="Max"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, max.invalid && styles.inputInvalid]}
          />
        </View>
        {amountNote === null ? null : (
          <Text style={[styles.note, !result.ok && styles.noteError]} testID="ledger-filter-amount-note">
            {amountNote}
          </Text>
        )}

        <Text style={styles.section}>SOURCE</Text>
        <View style={styles.chipRow}>
          {SOURCES.map(({ id, label, testID }) => {
            const selected = draft.sources.includes(id);
            return (
              <Pressable
                key={id}
                testID={testID}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={label}
                onPress={() => toggleSource(id)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>TYPE</Text>
        <View style={styles.chipRow}>
          {KINDS.map(({ id, testID }) => {
            const selected = draft.kinds.includes(id);
            const label = KIND_LABELS[id] ?? id;
            return (
              <Pressable
                key={id}
                testID={testID}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={label}
                onPress={() => toggleKind(id)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {accounts.length > 0 ? (
          <>
            <Text style={styles.section}>ACCOUNT</Text>
            <View style={styles.chipRow}>
              {[...accounts.map((a) => ({ id: a.id, label: a.name, archived: a.archivedAt !== null })), { id: 'none', label: 'No account', archived: false }].map(
                ({ id, label, archived: isArchived }) => {
                  const selected = draft.accountIds.includes(id);
                  return (
                    <Pressable
                      key={id}
                      testID={id === 'none' ? 'ledger-filter-account-none' : `ledger-filter-account-${id}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={isArchived ? `${label}, archived` : label}
                      onPress={() => toggleAccount(id)}
                      style={[styles.chip, selected && styles.chipSelected, isArchived && styles.archived]}>
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
                    </Pressable>
                  );
                },
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + layout.thumbZoneOffset }]}>
        <TactileButton testID="ledger-filter-reset" label="Reset" variant="secondary" onPress={reset} />
        <TactileButton testID="ledger-filter-apply" label="Apply" disabled={!result.ok} onPress={apply} style={styles.apply} />
      </View>

      {showPicker ? (
        <DatePickerSheet
          mode="range"
          value={draft.dateRange ?? last30(today)}
          maxRangeDays={366}
          onChange={(value) => {
            const range = value as { start: string; end: string };
            setDraft((current) => ({ ...current, dateRange: { start: range.start, end: range.end } }));
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenMargin },
  headerSpacer: { width: 26 },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  content: { paddingHorizontal: layout.screenMargin, paddingTop: space.base, paddingBottom: space.xl, gap: space.sm },
  section: { ...type.monoSm, color: colors.textMuted, marginTop: space.md },
  subSection: { ...type.monoSm, color: colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  archived: { opacity: 0.6 },
  chip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs },
  chipSelected: { backgroundColor: colors.credit, borderColor: colors.credit },
  chipLabel: { ...type.monoSm, color: colors.textMuted },
  chipLabelSelected: { color: colors.onAccent },
  tag: { borderWidth: 1.5, borderRadius: radius.micro, paddingHorizontal: space.sm, paddingVertical: space.xs },
  tagSelected: { backgroundColor: colors.credit },
  tagLabel: { ...type.monoSm },
  rangeLine: { ...type.monoSm, color: colors.text },
  amountRow: { flexDirection: 'row', gap: space.sm },
  input: {
    ...type.monoLg,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.md,
  },
  inputInvalid: { borderColor: colors.debit },
  note: { ...type.bodySm, color: colors.textMuted },
  noteError: { color: colors.debit },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenMargin,
    paddingTop: space.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
  },
  apply: { flex: 1 },
});
