/**
 * `/accounts/new` and `/accounts/[id]/edit` (docs/18 § Screens): name, type
 * plates, last 4 (bank and card), opening balance with a ± toggle for cards,
 * opening date, colour. Save fires `splitConfirm`.
 */

import {
  type AccountType,
  type CategoryColorToken,
  MAX_ACCOUNT_NAME_LENGTH,
  colors,
  formatMoney,
  layout,
  money,
  parseAmount,
  radius,
  space,
  todayISO,
  type,
} from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerSheet } from '@/components/ui/date-picker-sheet';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { ColorTokenPicker } from '@/features/categories';
import { haptic } from '@/lib/haptics';

import { newAccountId, saveAccount } from '../api/account-repository';
import { useAccounts } from '../hooks/use-accounts';
import { ACCOUNT_ERRORS, ACCOUNT_TYPES, type AccountForm, accountFromForm, cashSuggestion, formFromAccount, hasLast4 } from '../model/accounts-view';

export function AccountEditorScreen({ accountId, suggestCash = false }: { accountId?: string; suggestCash?: boolean }) {
  const insets = useSafeAreaInsets();
  const { uid, profile } = useSession();
  const accounts = useAccounts();
  const all = accounts.status === 'ready' ? accounts.snapshot.accounts : [];
  const editing = accountId ? all.find((account) => account.id === accountId) : undefined;

  const [form, setForm] = useState<AccountForm>(() =>
    suggestCash ? cashSuggestion(todayISO()) : { name: '', type: 'bank', last4: '', openingMinor: 0, openingOwed: false, openingDate: todayISO(), colorToken: 'ice' },
  );
  const [openingText, setOpeningText] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId] = useState(() => newAccountId(uid));

  useEffect(() => {
    if (!editing || prefilled) return;
    const next = formFromAccount(editing);
    setForm(next);
    setOpeningText(next.openingMinor === 0 ? '' : formatMoney(money(next.openingMinor, profile.currency)).replace(/[^\d.]/g, ''));
    setPrefilled(true);
  }, [editing, prefilled, profile.currency]);

  const set = (patch: Partial<AccountForm>) => setForm((value) => ({ ...value, ...patch }));

  const onOpeningChange = (text: string) => {
    setOpeningText(text);
    const parsed = text.trim() === '' ? money(0, profile.currency) : parseAmount(text, profile.currency);
    if (parsed) set({ openingMinor: Math.abs(parsed.minor) });
  };

  const onSave = async () => {
    if (openingText.trim() !== '' && !parseAmount(openingText, profile.currency)) {
      haptic('warning');
      setError(ACCOUNT_ERRORS.opening_balance_invalid);
      return;
    }
    const result = accountFromForm(form, profile.currency, {
      id: pendingId,
      now: new Date().toISOString(),
      existing: editing,
      sortOrder: all.filter((account) => account.archivedAt === null).length,
    });
    if ('error' in result) {
      haptic('warning');
      setError(ACCOUNT_ERRORS[result.error]);
      return;
    }
    setSaving(true);
    setError(null);
    // Firestore queues the write offline; don't wait for the server to leave.
    saveAccount(uid, result.account).catch((failure: unknown) => console.warn('[accounts] save failed', failure));
    haptic('splitConfirm');
    router.back();
  };

  const typeLabel = (accountType: AccountType) => ACCOUNT_TYPES.find((t) => t.type === accountType)?.label ?? accountType;

  return (
    <View testID="screen-account-editor" style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.base }]}>
      <View style={styles.header}>
        <Pressable testID="account-editor-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.eyebrow}>{editing ? 'EDIT ACCOUNT' : 'NEW ACCOUNT'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {error ? <Text testID="account-editor-error" style={styles.error}>{error}</Text> : null}

        <TextInput
          testID="account-editor-name"
          accessibilityLabel="Account name"
          value={form.name}
          onChangeText={(name) => set({ name })}
          placeholder="e.g. HDFC Salary"
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_ACCOUNT_NAME_LENGTH}
          style={styles.input}
        />

        <Text style={styles.sectionLabel}>TYPE</Text>
        <View style={styles.plates} accessibilityRole="radiogroup">
          {ACCOUNT_TYPES.map((option) => {
            const selected = form.type === option.type;
            return (
              <Pressable
                key={option.type}
                testID={`account-type-${option.type}`}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  haptic('selection');
                  set({ type: option.type });
                }}
                style={[styles.plate, selected && styles.plateSelected]}>
                <Ionicons name={option.glyph as never} size={20} color={selected ? colors.onAccent : colors.text} />
                <Text style={[styles.plateLabel, selected && styles.plateLabelSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {form.type === 'card' ? <Text style={styles.hint}>A credit card. A debit card is its bank account — pick Bank.</Text> : null}

        {hasLast4(form.type) ? (
          <>
            <Text style={styles.sectionLabel}>LAST 4 DIGITS</Text>
            <TextInput
              testID="account-editor-last4"
              accessibilityLabel="Last four digits"
              value={form.last4}
              onChangeText={(last4) => set({ last4: last4.replace(/\D/g, '').slice(0, 4) })}
              placeholder="1234"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              style={[styles.input, styles.mono]}
            />
            <Text style={styles.hint}>Used to match SMS from this {typeLabel(form.type).toLowerCase()}.</Text>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>OPENING BALANCE</Text>
        <View style={styles.openingRow}>
          {form.type === 'card' ? (
            <Pressable
              testID="account-editor-owed"
              accessibilityRole="switch"
              accessibilityLabel={form.openingOwed ? 'Owed on the card' : 'Credit on the card'}
              accessibilityState={{ checked: form.openingOwed }}
              onPress={() => {
                haptic('selection');
                set({ openingOwed: !form.openingOwed });
              }}
              style={[styles.signToggle, form.openingOwed && styles.signToggleOwed]}>
              <Text style={[styles.signText, form.openingOwed && styles.signTextOwed]}>{form.openingOwed ? '− OWED' : '+ CREDIT'}</Text>
            </Pressable>
          ) : null}
          <TextInput
            testID="account-editor-opening"
            accessibilityLabel="Opening balance"
            value={openingText}
            onChangeText={onOpeningChange}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.mono, styles.openingInput]}
          />
        </View>

        <Text style={styles.sectionLabel}>OPENING DATE</Text>
        <Pressable
          testID="account-editor-date"
          accessibilityRole="button"
          accessibilityLabel={`Opening date ${form.openingDate}`}
          onPress={() => setShowDate(true)}
          style={styles.dateChip}>
          <Ionicons name="calendar-outline" size={16} color={colors.text} />
          <Text style={styles.mono}>{form.openingDate}</Text>
        </Pressable>
        <Text style={styles.hint}>Enter the balance on the opening date. Transactions before that date will also be counted.</Text>

        <Text style={styles.sectionLabel}>COLOUR</Text>
        <ColorTokenPicker selected={form.colorToken} onSelect={(colorToken: CategoryColorToken) => set({ colorToken })} />
      </ScrollView>

      <TactileButton testID="account-editor-save" label={saving ? 'Saving…' : 'Save'} fullWidth disabled={saving} onPress={onSave} />

      {showDate ? (
        <DatePickerSheet
          mode="single"
          value={form.openingDate}
          allowFuture={false}
          onChange={(value) => {
            haptic('selection');
            set({ openingDate: value as string });
            setShowDate(false);
          }}
          onCancel={() => setShowDate(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenMargin },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  headerSpacer: { width: 26 },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  body: { gap: space.sm, paddingBottom: space.base },
  error: { ...type.bodySm, color: colors.debit },
  sectionLabel: { ...type.monoSm, color: colors.textMuted, marginTop: space.sm },
  hint: { ...type.bodySm, color: colors.textMuted },
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
  mono: { ...type.monoMd, color: colors.text },
  plates: { flexDirection: 'row', gap: space.xs },
  plate: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.card,
  },
  plateSelected: { backgroundColor: colors.credit, borderColor: colors.credit },
  plateLabel: { ...type.monoSm, color: colors.text },
  plateLabelSelected: { color: colors.onAccent },
  openingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  openingInput: { flex: 1 },
  signToggle: { borderWidth: 1.5, borderColor: colors.credit, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.sm },
  signToggleOwed: { borderColor: colors.debit },
  signText: { ...type.monoSm, color: colors.credit },
  signTextOwed: { color: colors.debit },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
});
