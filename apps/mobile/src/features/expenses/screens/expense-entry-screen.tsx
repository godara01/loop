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
  MAX_DESCRIPTION_LENGTH,
  type Money,
  MAX_NOTE_LENGTH,
  addDays,
  apportionRefund,
  canRecordRefund,
  categoryColors,
  colors,
  composeOccurredAt,
  duplicateExpense,
  editPersonalExpense,
  formatMoney,
  layout,
  localDateOf,
  newIncome,
  newPersonalExpense,
  newRefund as newRefundExpense,
  orderForEntry,
  palette,
  radius,
  refundableRemainder,
  restoreExpense,
  softDeleteExpense,
  space,
  timeOfDayOf,
  todayISO,
  type,
} from '@loop/shared';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
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

import { DatePickerSheet } from '@/components/ui/date-picker-sheet';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useSettings } from '@/core/providers/settings-provider';
import { type ExpenseDraft, useDraftStore } from '@/core/state/draft-store';
import { useUndoStore } from '@/core/state/undo-store';
// Deep paths: the accounts index re-exports screens that import this feature.
import { AccountChip } from '@/features/accounts/components/account-chip';
import { useAccounts } from '@/features/accounts/hooks/use-accounts';
import { defaultAccountId, rememberAccount, showAccountRow } from '@/features/accounts/model/default-account';
import { useCategories } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { newExpenseId, saveExpense } from '../api/expense-repository';
import { AmountPad } from '../components/amount-pad';
import { CategoryStrip } from '../components/category-strip';
import { DeleteExpenseSheet } from '../components/delete-expense-sheet';
import { KindSwitch } from '../components/kind-switch';
import { useExpense, useExpensesForLastDays, useRefundsOf } from '../hooks/use-expenses';
import { amountOf, canSave, displayAmount, inputFromMoney } from '../model/amount-input';
import {
  applyKindSwitch,
  categoriesForKind,
  entryKindFromParam,
  type EntryKind,
  preselectForKind,
  saveLabelForKind,
} from '../model/entry-kind';
import { usageCounts } from '../model/ledger';

const REPEAT_WINDOW_MS = 10 * 60_000;
const USAGE_WINDOW_DAYS = 30;
const INCOME_USAGE_WINDOW_DAYS = 90;

const logWriteFailure = (error: unknown) => console.warn('[expenses] write rejected', error);

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
  mode: 'new' | 'edit' | 'approve' | 'refund';
  expenseId?: string;
  approval?: ApprovalSource;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { uid, profile } = useSession();
  const currency = profile.currency;
  const params = useLocalSearchParams<{ kind?: string }>();

  const categoriesState = useCategories();
  const recent = useExpensesForLastDays(USAGE_WINDOW_DAYS);
  const incomeRecent = useExpensesForLastDays(INCOME_USAGE_WINDOW_DAYS);
  const existing = useExpense(mode === 'edit' ? expenseId : undefined);
  const originalExpenseState = useExpense(mode === 'refund' ? expenseId : undefined);
  const original = mode === 'refund' && originalExpenseState.status === 'ready' ? originalExpenseState.expense : null;
  // Load refunds for the original expense in both refund and edit modes
  const refundSourceId = mode === 'refund' ? expenseId : (existing.status === 'ready' ? existing.expense?.id : undefined);
  const refundsState = useRefundsOf(refundSourceId ?? undefined);
  const refunds = refundsState.status === 'ready' ? refundsState.snapshot.expenses : [];

  const { draft, startNew, startFrom, update, abandon, clear } = useDraftStore();
  const { settings, update: updateSettings } = useSettings();
  const accountsState = useAccounts();
  const allAccounts = accountsState.status === 'ready' ? accountsState.snapshot.accounts : [];
  const offerUndo = useUndoStore((s) => s.offerUndo);

  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

// Load original expense when editing a refund to check if it's deleted
const originalExpenseStateForDeletionCheck = useExpense(
  mode === 'edit' && existing.status === 'ready' && existing.expense.kind === 'refund'
    ? (existing.expense.refundOf ?? undefined)
    : undefined
);
  const originalExpenseForDeletionCheck = originalExpenseStateForDeletionCheck.status === 'ready' ? originalExpenseStateForDeletionCheck.expense : null;
  const originalDeleted = originalExpenseStateForDeletionCheck.status === 'missing' || (originalExpenseStateForDeletionCheck.status === 'ready' && originalExpenseForDeletionCheck?.deletedAt !== null);
  const leaving = useRef(false);
  const initialDraft = useRef<ExpenseDraft | null>(null);

  const [entryKind, setEntryKind] = useState<EntryKind>(() => {
    if (mode !== 'new') return 'expense';
    return entryKindFromParam(params.kind);
  });

  // Accounts (docs/18 § Entry sheet integration): hidden until an active account
  // exists; a new entry defaults to the account last used for its kind. Refunds
  // copy the original's account, and approvals get theirs in SM3.
  const editingKind = existing.status === 'ready' ? (existing.expense.kind ?? 'expense') : null;
  const showAccounts =
    showAccountRow(allAccounts) &&
    (mode === 'new' || (mode === 'edit' && (editingKind === 'expense' || editingKind === 'income')));
  const accountChoice: string | null =
    draft.accountId !== undefined
      ? draft.accountId
      : mode === 'new'
        ? defaultAccountId(entryKind, settings.lastAccountByKind, allAccounts)
        : null;
  // An archived account stays visible as the current choice on an old entry.
  const accountOptions = allAccounts.filter((account) => account.archivedAt === null || account.id === accountChoice);

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
        localDate: localDateOf(approval.initial.occurredAt),
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
        localDate: e.localDate,
        accountId: e.accountId ?? null,
      };
      startFrom(fromExpense);
      initialDraft.current = fromExpense;
      setStarted(true);
    } else if (mode === 'refund' && original && refundsState.status === 'ready') {
      // Initialize refund mode: pre-fill with refundable remainder, copy category/lines/account
      const remainder = refundableRemainder(original, refunds);
      const fromOriginal: ExpenseDraft = {
        amount: inputFromMoney(remainder),
        categoryId: original.categoryId,
        description: original.description,
        note: '',
        localDate: todayISO(),
      };
      startFrom(fromOriginal);
      initialDraft.current = fromOriginal;
      setStarted(true);
    }
  }, [mode, existing, approval, original, refunds, started, startNew, startFrom]);

  // Recalculate when entryKind changes
  const kindCounts: ReadonlyMap<string, number> = useMemo(() => {
    const source = entryKind === 'income' ? incomeRecent : recent;
    if (source.status !== 'ready') return new Map<string, number>();
    const windowDays = entryKind === 'income' ? INCOME_USAGE_WINDOW_DAYS : USAGE_WINDOW_DAYS;
    return usageCounts(source.snapshot.expenses, addDays(todayISO(), -(windowDays - 1)));
  }, [entryKind, recent, incomeRecent]);

  const activeCategories: Category[] = useMemo(() => {
    if (categoriesState.status !== 'ready') return [];
    const pool = categoriesForKind(categoriesState.snapshot.categories, entryKind);
    return orderForEntry(pool, kindCounts, false);
  }, [categoriesState, entryKind, kindCounts]);

  useEffect(() => {
    if (!started || draft.categoryId !== null) return;
    if (categoriesState.status !== 'ready') return;
    const id = preselectForKind(categoriesState.snapshot.categories, entryKind, kindCounts);
    if (id) update({ categoryId: id });
  }, [started, draft.categoryId, categoriesState, entryKind, kindCounts, update]);

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
    const accountId = accountChoice;
    try {
      if (mode === 'approve') {
        if (!approval) return;
        const dateChanged = draft.localDate !== localDateOf(approval.initial.occurredAt);
        approval
          .submit({
            total,
            categoryId: draft.categoryId,
            description: draft.description,
            note: draft.note,
            occurredAt: dateChanged
              ? composeOccurredAt(draft.localDate, timeOfDayOf(approval.initial.occurredAt), now)
              : approval.initial.occurredAt,
          })
          .catch(logWriteFailure);
        haptic('expenseSaved');
        clear();
        leave();
        return;
      }
      let expense: Expense;
      if (mode === 'new') {
        if (entryKind === 'income') {
          expense = newIncome({
            id: newExpenseId(uid),
            uid,
            total,
            categoryId: draft.categoryId,
            description: draft.description,
            note: draft.note,
            occurredAt: composeOccurredAt(draft.localDate, timeOfDayOf(nowIso), now),
            now: nowIso,
            accountId,
          });
        } else {
          expense = newPersonalExpense({
            id: newExpenseId(uid),
            uid,
            total,
            categoryId: draft.categoryId,
            description: draft.description,
            note: draft.note,
            occurredAt: composeOccurredAt(draft.localDate, timeOfDayOf(nowIso), now),
            now: nowIso,
            accountId,
          });
        }
        const remembered = rememberAccount(entryKind, accountId, settings.lastAccountByKind);
        if (remembered) updateSettings({ lastAccountByKind: remembered });
      } else {
        if (mode === 'refund') {
          if (!original) return;
          // Validate amount against refundable remainder
          const remainder = refundableRemainder(original, refunds);
          // Apportion the refund amount across the original's lines
          const lines = apportionRefund(original, total);
          if (total.minor > remainder.minor) {
            return refuse(`Refund amount exceeds refundable remainder of ${formatMoney(remainder)}`);
          }
          expense = newRefundExpense({
            id: newExpenseId(uid),
            uid,
            total,
            categoryId: original.categoryId,
            description: draft.description,
            note: draft.note,
            occurredAt: composeOccurredAt(draft.localDate, timeOfDayOf(nowIso), now),
            now: nowIso,
            refundOf: original.id,
            accountId: original.accountId,
            lines,
            refundableRemainder: remainder,
          });
        } else {
          if (existing.status !== 'ready') return;
          const original = existing.expense;
          const dateChanged = draft.localDate !== original.localDate;
          expense = editPersonalExpense(
            original,
            {
              total,
              categoryId: draft.categoryId,
              description: draft.description,
              note: draft.note,
              occurredAt: dateChanged
                ? composeOccurredAt(draft.localDate, timeOfDayOf(original.occurredAt), now)
                : original.occurredAt,
              ...(showAccounts ? { accountId } : {}),
            },
            nowIso,
          );
        }
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
    haptic('warning');
    setConfirmingDelete(true);
  };

  const confirmDelete = () => {
    if (existing.status !== 'ready') return;
    const expense = existing.expense;
    haptic('error');
    setConfirmingDelete(false);
    saveExpense(uid, softDeleteExpense(expense, new Date().toISOString())).catch(logWriteFailure);
    offerUndo('Expense deleted', () => {
      saveExpense(uid, restoreExpense(expense, new Date().toISOString())).catch(logWriteFailure);
    });
    clear();
    leave();
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

  const selectedCategory = activeCategories.find((c) => c.id === draft.categoryId);
  const saveLabel = mode === 'new' ? saveLabelForKind(entryKind) : 'Save changes';

  const handleKindChange = (nextKind: EntryKind) => {
    if (nextKind === entryKind) return;
    const source = nextKind === 'income' ? incomeRecent : recent;
    const windowDays = nextKind === 'income' ? INCOME_USAGE_WINDOW_DAYS : USAGE_WINDOW_DAYS;
    const counts =
      source.status === 'ready'
        ? usageCounts(source.snapshot.expenses, addDays(todayISO(), -(windowDays - 1)))
        : new Map<string, number>();
    const categories = categoriesState.status === 'ready' ? categoriesState.snapshot.categories : [];
    setEntryKind(nextKind);
    setError(null);
    const switched = applyKindSwitch(draft, nextKind, preselectForKind(categories, nextKind, counts));
    // Each kind remembers its own account: a switch goes back to that default.
    update({ categoryId: switched.categoryId, accountId: undefined });
  };

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
          {mode === 'new' ? (entryKind === 'income' ? 'NEW INCOME' : 'NEW EXPENSE') : mode === 'approve' ? 'APPROVE EXPENSE' : mode === 'refund' ? 'RECORD REFUND' : 'EDIT EXPENSE'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {mode === 'refund' ? (
        <View style={styles.kindSwitchWrap} testID="refund-kind-tag" accessibilityRole="none" accessibilityLabel="Refund mode">
          <View style={styles.refundTag}>
            <Ionicons name="refresh-circle-outline" size={16} color={colors.credit} />
            <Text style={styles.refundTagText}>REFUND</Text>
          </View>
        </View>
      ) : mode === 'new' ? (
        <View style={styles.kindSwitchWrap}>
          <KindSwitch value={entryKind} onChange={handleKindChange} />
        </View>
      ) : null}

      {mode === 'edit' && existing.status === 'ready' && canRecordRefund(existing.expense) ? (
        <Pressable
          testID="entry-record-refund"
          accessibilityRole="button"
          accessibilityLabel="Record refund"
          hitSlop={8}
          onPress={() => {
            haptic('selection');
            // Replace, not push: the entry screens share one draft store, so a
            // refund opened on top would overwrite this edit's draft and leave
            // it blank (₹0) underneath when the refund saves.
            router.replace(`/expense/refund/${existing.expense.id}`);
          }}
          style={styles.refundRecordButton}>
          <Ionicons name="refresh-circle-outline" size={16} color={palette.lime} />
          <Text style={styles.refundRecordButtonText}>RECORD REFUND</Text>
        </Pressable>
      ) : null}

      {mode === 'edit' && existing.status === 'ready' && existing.expense.kind === 'refund' && originalDeleted ? (
        <View testID="refund-original-deleted" style={styles.refundOriginalDeleted}>
          <Text style={[type.bodyLg, { color: colors.textMuted }]}>Original deleted</Text>
        </View>
      ) : null}
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
            style={[styles.amount, entryKind === 'income' && styles.amountIncome]}
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

        {mode === 'refund' ? (
          // Read-only category display for refund mode
          <View testID="refund-category-display" style={styles.refundCategoryDisplay}>
            <Text style={styles.refundCategoryLabel}>Category</Text>
            {selectedCategory ? (
              <View style={styles.refundCategoryChip}>
                <View style={[styles.refundCategoryDot, { backgroundColor: categoryColors[selectedCategory.colorToken].tint }]} />
                <Text style={styles.refundCategoryName}>{selectedCategory.name}</Text>
              </View>
            ) : (
              <Text style={styles.refundCategoryName}>Loading...</Text>
            )}
          </View>
        ) : (
          <CategoryStrip
            categories={activeCategories}
            selectedId={draft.categoryId}
            onSelect={(categoryId) => {
              setError(null);
              update({ categoryId });
            }}
            onAddNew={() => router.push('/category/catalogue?returnTo=entry')}
          />
        )}

        {showAccounts ? (
          <AccountChip
            accounts={accountOptions}
            value={accountChoice}
            onChange={(accountId) => update({ accountId })}
          />
        ) : null}

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
            testID="entry-date-today"
            accessibilityRole="button"
            accessibilityLabel="Today"
            onPress={() => {
              haptic('selection');
              update({ localDate: todayISO() });
            }}
            style={[styles.dateChip, draft.localDate === todayISO() && styles.dateChipSelected]}>
            <Text style={[styles.dateChipText, draft.localDate === todayISO() && styles.dateChipTextSelected]}>
              TODAY
            </Text>
          </Pressable>
          <Pressable
            testID="entry-date-yesterday"
            accessibilityRole="button"
            accessibilityLabel="Yesterday"
            onPress={() => {
              haptic('selection');
              update({ localDate: addDays(todayISO(), -1) });
            }}
            style={[styles.dateChip, draft.localDate === addDays(todayISO(), -1) && styles.dateChipSelected]}>
            <Text style={[styles.dateChipText, draft.localDate === addDays(todayISO(), -1) && styles.dateChipTextSelected]}>
              YESTERDAY
            </Text>
          </Pressable>
          <Pressable
            testID="entry-date-pick"
            accessibilityRole="button"
            accessibilityLabel={`Pick date: ${draft.localDate}`}
            onPress={() => {
              haptic('selection');
              setShowDatePicker(true);
            }}
            style={[
              styles.dateChip,
              draft.localDate !== todayISO() && draft.localDate !== addDays(todayISO(), -1) && styles.dateChipSelected,
            ]}>
            <Text
              style={[
                styles.dateChipText,
                draft.localDate !== todayISO() && draft.localDate !== addDays(todayISO(), -1) && styles.dateChipTextSelected,
              ]}>
              📅 {draft.localDate}
            </Text>
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

        {mode === 'edit' && existing.status === 'ready' && refunds.filter((r) => r.deletedAt === null).length > 0 ? (
          <View testID="refunds-section" style={styles.refundsSection}>
            <Text testID="refunds-section-title" style={styles.refundsSectionTitle}>Refunds</Text>
            {refunds.filter((r) => r.deletedAt === null).map((refund) => (
              <View key={refund.id} testID={`refund-row-${refund.id}`} style={[styles.refundRow, refund.deletedAt && styles.refundRowDeleted]}>
                <View style={styles.refundInfo}>
                  <Text testID={`refund-amount-${refund.id}`} style={styles.refundAmount}>
                    {formatMoney(refund.total)}
                  </Text>
                  <Text testID={`refund-date-${refund.id}`} style={styles.refundDate}>
                    {refund.localDate}
                  </Text>
                </View>
              </View>
            ))}
            {(() => {
              const liveRefunds = refunds.filter((r) => r.deletedAt === null);
              const totalRefunded = liveRefunds.reduce((sum, r) => sum + r.total.minor, 0);
              const remainder = Math.max(0, existing.expense.total.minor - totalRefunded);
              if (totalRefunded > existing.expense.total.minor) {
                const excess = totalRefunded - existing.expense.total.minor;
                return (
                  <Text testID="refunds-exceed" style={[type.bodyLg, { color: colors.debit }]}>
                    Refunds exceed the purchase by {formatMoney({ minor: excess, currency: existing.expense.total.currency })}
                  </Text>
                );
              }
              return (
                 <Text testID="refunds-summary" style={[type.bodyLg, { color: colors.text }]}>
                  {formatMoney({ minor: totalRefunded, currency: existing.expense.total.currency })} of {formatMoney(existing.expense.total)} refunded
                </Text>
              );
            })()}
          </View>
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
          label={mode === 'new' ? saveLabel : mode === 'approve' ? 'Approve' : mode === 'refund' ? 'Save refund' : 'Update'}
          fullWidth
          onPress={onSave}
        />
      </View>

      <DeleteExpenseSheet
        expense={confirmingDelete && existing.status === 'ready' ? existing.expense : null}
        category={
          existing.status === 'ready' && categoriesState.status === 'ready'
            ? categoriesState.snapshot.categories.find((c) => c.id === existing.expense.categoryId)
            : undefined
        }
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />

      {showDatePicker ? (
        <DatePickerSheet
          mode="single"
          value={draft.localDate}
          onChange={(value) => {
            haptic('selection');
            update({ localDate: value as string });
            setShowDatePicker(false);
          }}
          onCancel={() => setShowDatePicker(false)}
          allowFuture={false}
        />
      ) : null}
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
  kindSwitchWrap: { paddingHorizontal: 0, paddingBottom: space.xs },
  amountIncome: { color: colors.credit },
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  dateChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  dateChipSelected: {
    backgroundColor: palette.lime,
    borderColor: palette.lime,
  },
  dateChipText: { ...type.monoSm, color: colors.text },
  dateChipTextSelected: { color: palette.void },
  moreToggle: { marginLeft: 'auto' },
  moreText: { ...type.monoSm, color: colors.textMuted },
  refundTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  refundTagText: { ...type.monoSm, color: colors.credit },
  refundCategoryDisplay: { marginTop: space.xs },
  refundCategoryLabel: { ...type.monoSm, color: colors.textMuted, marginBottom: space.xs },
  refundCategoryChip: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  refundCategoryDot: { width: 8, height: 8, borderRadius: 4 },
  refundCategoryName: { ...type.bodyLg, color: colors.text },
  refundsSection: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1.5, borderTopColor: colors.border },
  refundsSectionTitle: { ...type.monoSm, color: colors.textMuted, marginBottom: space.md },
  refundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  refundRowDeleted: { opacity: 0.5 },
  refundInfo: { flex: 1 },
  refundAmount: { ...type.monoLg, color: colors.credit, fontFamily: type.monoLg.fontFamily },
  refundDate: { ...type.monoSm, color: colors.textMuted, marginTop: 2 },
  refundNote: { ...type.bodySm, color: colors.textMuted, marginTop: 2 },
  refundExceeds: { ...type.bodySm, color: colors.debit, marginTop: space.md },
  refundRecordButton: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md },
  refundRecordButtonText: { ...type.monoSm, color: palette.lime },
    refundOriginalDeleted: { ...type.bodyLg, color: colors.textMuted, marginTop: space.xs },
 });
