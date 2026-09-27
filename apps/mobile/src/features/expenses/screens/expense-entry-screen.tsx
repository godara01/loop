/**
 * Add and edit share one sheet. See docs/03-expenses.md.
 *
 * The target is under ten seconds from launch to saved: the pad is live on
 * open, the most-used category is preselected, and the date defaults to today.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type Category,
  type Expense,
  ExpenseError,
  FALLBACK_CATEGORY_SLUG,
  MAX_DESCRIPTION_LENGTH,
  type Money,
  MAX_NOTE_LENGTH,
  addDays,
  colors,
  duplicateExpense,
  editPersonalExpense,
  formatMoney,
  layout,
  localDateOf,
  newPersonalExpense,
  orderForEntry,
  radius,
  restoreExpense,
  softDeleteExpense,
  space,
  todayISO,
  type,
} from '@loop/shared';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { type ExpenseDraft, useDraftStore } from '@/core/state/draft-store';
import { useUndoStore } from '@/core/state/undo-store';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { newExpenseId, saveExpense } from '../api/expense-repository';
import { AmountPad } from '../components/amount-pad';
import { CategoryStrip } from '../components/category-strip';
import { useExpense, useExpensesForLastDays } from '../hooks/use-expenses';
import { amountOf, canSave, displayAmount, inputFromMoney } from '../model/amount-input';
import { dayLabel, usageCounts } from '../model/ledger';

const REPEAT_WINDOW_MS = 10 * 60_000;
const USAGE_WINDOW_DAYS = 30;

const logWriteFailure = (error: unknown) => console.warn('[expenses] write rejected', error);

/** The instant an expense happened: now, shifted back by whole days. */
function occurredAtFor(daysAgo: number, now: Date): string {
  return new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
}

function daysAgoOf(localDate: string): number {
  const today = todayISO();
  let days = 0;
  while (addDays(today, -days) > localDate && days < 3650) days += 1;
  return days;
}

export interface ApprovalFields {
  readonly total: Money;
  readonly categoryId: string;
  readonly description: string;
  readonly note: string | null;
  readonly occurredAt: string;
}

/**
 * "Edit & approve" from the inbox: the sheet opens prefilled from a pending
 * item and hands the result back instead of saving an expense itself. The
 * caller owns the write, so this feature knows nothing about the inbox.
 * `submit` throws synchronously on invalid input, like `newPersonalExpense`.
 */
export interface ApprovalSource {
  readonly initial: {
    readonly total: Money;
    readonly categoryId: string | null;
    readonly description: string;
    readonly occurredAt: string;
  };
  readonly submit: (fields: ApprovalFields) => Promise<void>;
}

export function ExpenseEntryScreen({
  mode,
  expenseId,
  approval,
}: {
  mode: 'new' | 'edit' | 'approve';
  expenseId?: string;
  approval?: ApprovalSource;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { uid, profile } = useSession();
  const currency = profile.currency;

  const categoriesState = useCategories();
  const recent = useExpensesForLastDays(USAGE_WINDOW_DAYS);
  const existing = useExpense(mode === 'edit' ? expenseId : undefined);

  const { draft, startNew, startFrom, update, abandon, clear } = useDraftStore();
  const offerUndo = useUndoStore((s) => s.offerUndo);

  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const leaving = useRef(false);
  const initialDraft = useRef<ExpenseDraft | null>(null);

  const activeCategories: Category[] = useMemo(() => {
    if (categoriesState.status !== 'ready') return [];
    const counts =
      recent.status === 'ready'
        ? usageCounts(recent.snapshot.expenses, addDays(todayISO(), -(USAGE_WINDOW_DAYS - 1)))
        : new Map<string, number>();
    return orderForEntry(categoriesState.snapshot.categories, counts, false);
  }, [categoriesState, recent]);

  // Initialise the draft once: blank for a new entry, the expense for an edit.
  useEffect(() => {
    if (started) return;
    if (mode === 'new') {
      startNew(Date.now());
      setStarted(true);
    } else if (mode === 'approve' && approval) {
      const fromPending: ExpenseDraft = {
        amount: inputFromMoney(approval.initial.total),
        categoryId: approval.initial.categoryId,
        description: approval.initial.description,
        note: '',
        daysAgo: daysAgoOf(localDateOf(approval.initial.occurredAt)),
      };
      startFrom(fromPending);
      initialDraft.current = fromPending;
      setStarted(true);
    } else if (existing.status === 'ready') {
      const e = existing.expense;
      const fromExpense: ExpenseDraft = {
        amount: inputFromMoney(e.total),
        categoryId: e.categoryId,
        description: e.description,
        note: e.note ?? '',
        daysAgo: daysAgoOf(e.localDate),
      };
      startFrom(fromExpense);
      initialDraft.current = fromExpense;
      setStarted(true);
    }
  }, [mode, existing, approval, started, startNew, startFrom]);

  // Preselect the most-used category of the last 30 days, else OTHER.
  useEffect(() => {
    if (!started || draft.categoryId !== null || activeCategories.length === 0) return;
    const counts =
      recent.status === 'ready'
        ? usageCounts(recent.snapshot.expenses, addDays(todayISO(), -(USAGE_WINDOW_DAYS - 1)))
        : new Map<string, number>();
    const mostUsed = activeCategories.find((c) => (counts.get(c.id) ?? 0) > 0);
    const fallback = activeCategories.find((c) => c.slug === FALLBACK_CATEGORY_SLUG) ?? activeCategories[0];
    update({ categoryId: (mostUsed ?? fallback)?.id ?? null });
  }, [started, draft.categoryId, activeCategories, recent, update]);

  const dirty =
    mode === 'new'
      ? draft.amount.text !== '' || draft.description !== '' || draft.note !== ''
      : initialDraft.current !== null && JSON.stringify(initialDraft.current) !== JSON.stringify(draft);

  // Confirm before throwing typed input away — back button, gesture, or ✕.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current || !dirty) {
          if (mode === 'new' && !leaving.current) abandon(Date.now());
          return;
        }
        event.preventDefault();
        haptic('warning');
        Alert.alert(mode === 'new' ? 'Discard this expense?' : 'Discard your changes?', undefined, [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              haptic('tap');
              if (mode === 'new') abandon(Date.now());
              leaving.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]);
      }),
    [navigation, dirty, mode, abandon],
  );

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const refuse = (message: string) => {
    haptic('warning');
    setError(message);
    shake.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };

  const leave = () => {
    leaving.current = true;
    router.back();
  };

  const onSave = () => {
    const total = amountOf(draft.amount, currency);
    if (!total || !canSave(draft.amount, currency)) return refuse('Enter an amount above zero.');
    if (!draft.categoryId) return refuse('Pick a category.');

    const now = new Date();
    const nowIso = now.toISOString();
    try {
      if (mode === 'approve') {
        if (!approval) return;
        const dateChanged = draft.daysAgo !== daysAgoOf(localDateOf(approval.initial.occurredAt));
        approval
          .submit({
            total,
            categoryId: draft.categoryId,
            description: draft.description,
            note: draft.note,
            // Keep the bank's timestamp unless the day itself was changed.
            occurredAt: dateChanged ? occurredAtFor(draft.daysAgo, now) : approval.initial.occurredAt,
          })
          .catch(logWriteFailure);
        haptic('expenseSaved');
        clear();
        leave();
        return;
      }
      let expense: Expense;
      if (mode === 'new') {
        expense = newPersonalExpense({
          id: newExpenseId(uid),
          uid,
          total,
          categoryId: draft.categoryId,
          description: draft.description,
          note: draft.note,
          occurredAt: occurredAtFor(draft.daysAgo, now),
          now: nowIso,
        });
      } else {
        if (existing.status !== 'ready') return;
        const original = existing.expense;
        const dateChanged = draft.daysAgo !== daysAgoOf(original.localDate);
        expense = editPersonalExpense(
          original,
          {
            total,
            categoryId: draft.categoryId,
            description: draft.description,
            note: draft.note,
            // Keep the original time of day unless the day itself was changed.
            occurredAt: dateChanged ? occurredAtFor(draft.daysAgo, now) : original.occurredAt,
          },
          nowIso,
        );
      }
      saveExpense(uid, expense).catch(logWriteFailure);
    } catch (failure) {
      haptic('error');
      setError(failure instanceof ExpenseError ? failure.message : String(failure));
      return;
    }

    haptic('expenseSaved');
    clear();
    leave();
  };

  const onDelete = () => {
    if (existing.status !== 'ready') return;
    const expense = existing.expense;
    haptic('warning');
    Alert.alert('Delete this expense?', `${formatMoney(expense.total)} · ${expense.description || 'no description'}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptic('destructive');
          saveExpense(uid, softDeleteExpense(expense, new Date().toISOString())).catch(logWriteFailure);
          offerUndo('Expense deleted', () => {
            saveExpense(uid, restoreExpense(expense, new Date().toISOString())).catch(logWriteFailure);
          });
          clear();
          leave();
        },
      },
    ]);
  };

  const onDuplicate = () => {
    if (existing.status !== 'ready') return;
    haptic('tap');
    const now = new Date().toISOString();
    saveExpense(uid, duplicateExpense(existing.expense, newExpenseId(uid), now)).catch(logWriteFailure);
    haptic('expenseSaved');
    clear();
    leave();
  };

  // "Same as ₹120 · FOOD" for an expense logged in the last ten minutes.
  const repeatSource: Expense | null = useMemo(() => {
    if (mode !== 'new' || recent.status !== 'ready') return null;
    const latest = [...recent.snapshot.expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return latest && Date.now() - Date.parse(latest.createdAt) <= REPEAT_WINDOW_MS ? latest : null;
  }, [mode, recent]);

  if (mode === 'edit' && existing.status === 'missing') {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>This expense no longer exists.</Text>
        <TactileButton testID="entry-missing-back" label="Back" variant="secondary" onPress={leave} style={styles.spaced} />
      </View>
    );
  }

  const today = todayISO();
  const date = addDays(today, -draft.daysAgo);
  const selectedCategory = activeCategories.find((c) => c.id === draft.categoryId);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.base }]}
      // `edgeToEdgeEnabled` in app.json means Android's own window-resize-on-keyboard
      // behaviour cannot be relied on, so the fixed Save button is kept above the
      // keyboard here instead. iOS never resizes the window at all and always needs this.
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      keyboardVerticalOffset={insets.top}>
      <View style={styles.header}>
        <Pressable testID="entry-close" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>
          {mode === 'new' ? 'NEW EXPENSE' : mode === 'approve' ? 'APPROVE EXPENSE' : 'EDIT EXPENSE'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {mode === 'edit' ? (
        // A row of its own, clear of the top-right corner: every dev build
        // overlays a floating "open dev menu" button there, and icon-only
        // actions crammed into that corner were also a marginal touch target.
        <View style={styles.editActions}>
          <Pressable
            testID="entry-duplicate"
            accessibilityRole="button"
            accessibilityLabel="Duplicate"
            hitSlop={8}
            onPress={onDuplicate}
            style={styles.editAction}>
            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
            <Text style={styles.editActionLabel}>DUPLICATE</Text>
          </Pressable>
          <Pressable
            testID="entry-delete"
            accessibilityRole="button"
            accessibilityLabel="Delete"
            hitSlop={8}
            onPress={onDelete}
            style={styles.editAction}>
            <Ionicons name="trash-outline" size={16} color={colors.debit} />
            <Text style={[styles.editActionLabel, styles.editActionDestructive]}>DELETE</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Animated.View style={shakeStyle}>
          <Text
            testID="entry-amount"
            style={styles.amount}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Amount ${displayAmount(draft.amount, currency)}`}>
            {displayAmount(draft.amount, currency)}
          </Text>
        </Animated.View>
        {error ? (
          <Text testID="entry-error" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {repeatSource ? (
          <Pressable
            testID="entry-repeat"
            accessibilityRole="button"
            accessibilityLabel={`Same as ${formatMoney(repeatSource.total)}, ${repeatSource.description || 'last expense'}`}
            onPress={() => {
              haptic('selection');
              update({ categoryId: repeatSource.categoryId, description: repeatSource.description });
            }}
            style={styles.repeat}>
            <Text style={styles.repeatText}>
              Same as {formatMoney(repeatSource.total)} · {repeatSource.description || 'last expense'}
            </Text>
          </Pressable>
        ) : null}

        <CategoryStrip
          categories={activeCategories}
          selectedId={draft.categoryId}
          onSelect={(categoryId) => {
            setError(null);
            update({ categoryId });
          }}
          onAddNew={() => router.push('/category/catalogue?returnTo=entry')}
        />

        <TextInput
          testID="entry-description"
          value={draft.description}
          onChangeText={(description) => update({ description })}
          placeholder={selectedCategory ? `What was it? (${selectedCategory.name})` : 'What was it?'}
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_DESCRIPTION_LENGTH}
          style={styles.input}
          returnKeyType="done"
        />

        <View style={styles.dateRow}>
          <Pressable
            testID="entry-date-earlier"
            accessibilityLabel="Earlier day"
            hitSlop={10}
            onPress={() => {
              haptic('selection');
              update({ daysAgo: draft.daysAgo + 1 });
            }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text testID="entry-date" style={styles.dateLabel}>
            {dayLabel(date, today).toUpperCase()}
          </Text>
          <Pressable
            testID="entry-date-later"
            accessibilityLabel="Later day"
            hitSlop={10}
            disabled={draft.daysAgo === 0}
            onPress={() => {
              if (draft.daysAgo === 0) return haptic('warning');
              haptic('selection');
              update({ daysAgo: draft.daysAgo - 1 });
            }}>
            <Ionicons name="chevron-forward" size={22} color={draft.daysAgo === 0 ? colors.border : colors.text} />
          </Pressable>
          <Pressable testID="entry-more" accessibilityRole="button" accessibilityLabel={showMore ? 'Hide note' : 'Add a note'} onPress={() => setShowMore((v) => !v)} style={styles.moreToggle}>
            <Text style={styles.moreText}>{showMore ? 'LESS' : 'NOTE'}</Text>
          </Pressable>
        </View>

        {showMore ? (
          <TextInput
            testID="entry-note"
            value={draft.note}
            onChangeText={(note) => update({ note })}
            placeholder="Note"
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_NOTE_LENGTH}
            multiline
            style={[styles.input, styles.note]}
          />
        ) : null}

        <AmountPad
          value={draft.amount}
          currency={currency}
          onChange={(amount) => {
            setError(null);
            update({ amount });
          }}
        />
      </ScrollView>

      <View testID="entry-save" accessible>
        <TactileButton
          testID="entry-save-button"
          label={mode === 'new' ? 'Save' : mode === 'approve' ? 'Approve' : 'Update'}
          fullWidth
          onPress={onSave}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenMargin },
  centered: { alignItems: 'center', justifyContent: 'center' },
  spaced: { marginTop: space.lg },
  muted: { ...type.bodyLg, color: colors.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headerSpacer: { width: 26 },
  editActions: { flexDirection: 'row', gap: space.lg, marginBottom: space.xs },
  editAction: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  editActionLabel: { ...type.monoSm, color: colors.textMuted },
  editActionDestructive: { color: colors.debit },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  // Bounded so it scrolls within the remaining space instead of pushing the
  // fixed Save button below the fold when the keyboard opens.
  scroll: { flex: 1 },
  body: { gap: space.md, paddingBottom: space.base },
  amount: { ...type.displayLg, fontFamily: type.monoLg.fontFamily, fontSize: 52, lineHeight: 60, color: colors.text },
  error: { ...type.bodySm, color: colors.debit },
  repeat: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  repeatText: { ...type.bodySm, color: colors.textMuted },
  input: {
    ...type.bodyLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.base,
    paddingVertical: space.md,
  },
  note: { minHeight: 72, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dateLabel: { ...type.monoMd, color: colors.text, minWidth: 110, textAlign: 'center' },
  moreToggle: { marginLeft: 'auto' },
  moreText: { ...type.monoSm, color: colors.textMuted },
});
