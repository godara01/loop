/**
 * Step 5 — First expense. The same entry sheet, inline.
 * See docs/02-onboarding.md#step-5--first-expense.
 */

import {
  type Category,
  colors,
  layout,
  newPersonalExpense,
  space,
  todayISO,
  type,
} from '@loop/shared';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TactileButton } from '@/components/ui/tactile-button';
import { updateProfile } from '@/core/firebase/session-repository';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useCategories } from '@/features/categories/hooks/use-categories';
import { newExpenseId, saveExpense } from '@/features/expenses/api/expense-repository';
import { AmountPad } from '@/features/expenses/components/amount-pad';
import { CategoryStrip } from '@/features/expenses/components/category-strip';
import {
  EMPTY_AMOUNT,
  amountOf,
  canSave,
  displayAmount,
} from '@/features/expenses/model/amount-input';
import { saveCheckIn } from '@/features/gamification/api/gamification-repository';
import { haptic } from '@/lib/haptics';

export function FirstExpenseStepScreen() {
  const insets = useSafeAreaInsets();
  const { uid, profile } = useSession();
  const currency = profile.currency || 'INR';

  const categoriesState = useCategories();
  const categories: Category[] = useMemo(() => {
    return categoriesState.status === 'ready'
      ? categoriesState.snapshot.categories.filter((c) => c.archivedAt === null)
      : [];
  }, [categoriesState]);

  const [amount, setAmount] = useState(EMPTY_AMOUNT);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default select the first active category
  React.useEffect(() => {
    if (categories.length > 0 && selectedCategoryId === null) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const handleSave = async () => {
    if (!canSave(amount, currency)) {
      setError('Enter an amount to log');
      haptic('warning');
      return;
    }
    if (!selectedCategoryId) {
      setError('Pick a category');
      haptic('warning');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const today = todayISO();
      const total = amountOf(amount, currency);
      if (!total) {
        setSaving(false);
        return;
      }

      const expense = newPersonalExpense({
        id: newExpenseId(uid),
        uid,
        total,
        categoryId: selectedCategoryId,
        description: description.trim(),
        note: null,
        occurredAt: now,
        now,
      });

      await saveExpense(uid, expense);
      await saveCheckIn(uid, today);
      await updateProfile(uid, { onboardedAt: now });

      haptic('expenseSaved');
      router.replace('/(tabs)');
    } catch (err) {
      console.warn('First expense error:', err);
      setError('Could not save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await updateProfile(uid, { onboardedAt: now });
      haptic('press');
      router.replace('/(tabs)');
    } catch (err) {
      console.warn('Skip error:', err);
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        testID="screen-onboarding-first-expense"
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.md },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>STEP 4 OF 4</Text>
          <Text style={styles.title}>First expense</Text>
          <Text style={styles.subtitle}>Log something you spent today.</Text>
        </View>

        <View style={styles.amountDisplay}>
          <Text style={styles.amountText} testID="onboarding-amount-preview">
            {displayAmount(amount, currency)}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <CategoryStrip
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={(id) => {
            setError(null);
            setSelectedCategoryId(id);
          }}
          onAddNew={() => router.push('/category/new')}
        />

        <TextInput
          testID="onboarding-expense-description"
          value={description}
          onChangeText={setDescription}
          placeholder="What was it? (optional)"
          placeholderTextColor={colors.textMuted}
          maxLength={100}
          style={styles.input}
          returnKeyType="done"
        />

        <AmountPad
          value={amount}
          currency={currency}
          onChange={(next) => {
            setError(null);
            setAmount(next);
          }}
        />

        <View style={styles.buttonGroup}>
          <TactileButton
            testID="onboarding-save-expense"
            label="Save"
            fullWidth
            disabled={saving || !canSave(amount, currency)}
            onPress={handleSave}
          />
          <TactileButton
            testID="onboarding-skip-expense"
            label="Skip for now"
            variant="secondary"
            fullWidth
            disabled={saving}
            onPress={handleSkip}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: space.md,
  },
  header: { gap: space.xs },
  eyebrow: { ...type.monoSm, color: colors.credit, letterSpacing: 1.5 },
  title: { ...type.headlineLg, color: colors.text },
  subtitle: { ...type.bodyMd, color: colors.textMuted },
  amountDisplay: {
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    ...type.displayLg,
    fontFamily: type.monoLg.fontFamily,
    fontSize: 48,
    lineHeight: 56,
    color: colors.text,
  },
  error: { ...type.bodySm, color: colors.debit },
  input: {
    ...type.bodyLg,
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  buttonGroup: {
    gap: space.xs,
    marginTop: space.sm,
    paddingBottom: space.md,
  },
});
