/**
 * The v1.2 inbox cards that need a decision of their own (docs/12 § The inbox,
 * docs/17 § Credit SMS): a refund, a card-bill payment, and a transfer pair.
 * Nothing is applied automatically — every card ends in a tap.
 */

import { type Account, type Expense, type Money, colors, formatMoney, layout, money, radius, space, type } from '@loop/shared';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { AccountChip } from '@/features/accounts/components/account-chip';
import { haptic } from '@/lib/haptics';

import type { PendingExpense } from '../model/approval';

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(iso));
const amountOf = (item: PendingExpense) => formatMoney(money(item.amountMinor, item.currency));
const last4 = (account: Account) => (account.last4 ? ` ••${account.last4}` : '');

function Header({ item, plus, tag }: { item: PendingExpense; plus?: boolean; tag: string }) {
  return (
    <View style={styles.top}>
      <View style={styles.info}>
        <MonoTag tone={plus ? 'credit' : undefined}>{tag}</MonoTag>
        <Text style={styles.hint} numberOfLines={1}>{item.displayHint}</Text>
      </View>
      <View style={styles.right}>
        <Text testID={`pending-card-${item.id}-amount`} style={[styles.amount, plus && styles.amountIn]}>{`${plus ? '+' : ''}${amountOf(item)}`}</Text>
        <Text style={styles.time}>{shortDate(item.occurredAt)}</Text>
      </View>
    </View>
  );
}

/**
 * "Refund for ₹499 AMAZON on 12 Mar?" — Yes / Different purchase / It's income.
 * With no match: Pick a purchase / It's income / Dismiss.
 */
export function RefundCard({
  item,
  original,
  onYes,
  onDifferent,
  onIncome,
  onDismiss,
}: {
  item: PendingExpense;
  original: Expense | null;
  onYes: () => void;
  onDifferent: () => void;
  onIncome: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card style={styles.card}>
      <View testID={`pending-card-${item.id}`} style={styles.body}>
        <Header item={item} plus tag="REFUND" />
        <Text testID={`pending-card-${item.id}-question`} style={styles.question}>
          {original
            ? `Refund for ${formatMoney(original.total)} ${original.description || 'purchase'} on ${shortDate(original.occurredAt)}?`
            : 'No matching purchase found. Attach one, or keep it as income.'}
        </Text>
        <View style={styles.actions}>
          {original ? (
            <TactileButton testID={`pending-card-${item.id}-yes`} label="Yes" style={styles.action} onPress={onYes} />
          ) : null}
          <TactileButton
            testID={`pending-card-${item.id}-different`}
            label={original ? 'Different purchase' : 'Pick a purchase'}
            variant="secondary"
            style={styles.action}
            onPress={onDifferent}
          />
        </View>
        <View style={styles.actions}>
          <TactileButton testID={`pending-card-${item.id}-income`} label="It's income" variant="secondary" style={styles.action} onPress={onIncome} />
          <TactileButton testID={`pending-card-${item.id}-dismiss`} label="Dismiss" variant="secondary" style={styles.action} onPress={onDismiss} />
        </View>
      </View>
    </Card>
  );
}

/** A card-bill payment: to the matched card, from an account the user picks (both required). */
export function CardBillCard({
  item,
  toAccount,
  accounts,
  fromAccountId,
  onPickFrom,
  onApprove,
  onDismiss,
}: {
  item: PendingExpense;
  toAccount: Account | null;
  accounts: readonly Account[];
  fromAccountId: string | null;
  onPickFrom: (accountId: string | null) => void;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const fromOptions = accounts.filter((a) => a.id !== toAccount?.id);
  return (
    <Card style={styles.card}>
      <View testID={`pending-card-${item.id}`} style={styles.body}>
        <Header item={item} tag="CARD PAYMENT" />
        <Text style={styles.question}>
          {toAccount ? `Paying ${toAccount.name}${last4(toAccount)} from:` : `No account has ••${item.accountLast4 ?? '????'} yet. Add the card under Accounts to log this payment.`}
        </Text>
        {toAccount ? <AccountChip accounts={fromOptions} value={fromAccountId} onChange={onPickFrom} label="From" testID={`pending-card-${item.id}-from`} /> : null}
        <View style={styles.actions}>
          <TactileButton testID={`pending-card-${item.id}-dismiss`} label="Dismiss" variant="secondary" style={styles.action} onPress={onDismiss} />
          <TactileButton
            testID={`pending-card-${item.id}-approve`}
            label="Approve"
            disabled={!toAccount || !fromAccountId}
            style={styles.action}
            onPress={onApprove}
          />
        </View>
      </View>
    </Card>
  );
}

/** "Looks like a transfer: HDFC ••1234 → SBI ••9876" — Merge / Keep separate. */
export function PairCard({
  id,
  debit,
  from,
  to,
  onMerge,
  onKeepSeparate,
}: {
  id: string;
  debit: PendingExpense;
  from: Account;
  to: Account;
  onMerge: () => void;
  onKeepSeparate: () => void;
}) {
  return (
    <Card style={styles.card}>
      <View testID={`pending-pair-${debit.id}`} accessibilityLabel={`Pair ${id}`} style={styles.body}>
        <Header item={debit} tag="TRANSFER?" />
        <Text testID={`pending-pair-${debit.id}-question`} style={styles.question}>
          {`Looks like a transfer: ${from.name}${last4(from)} → ${to.name}${last4(to)}`}
        </Text>
        <View style={styles.actions}>
          <TactileButton testID={`pending-pair-${debit.id}-separate`} label="Keep separate" variant="secondary" style={styles.action} onPress={onKeepSeparate} />
          <TactileButton testID={`pending-pair-${debit.id}-merge`} label="Merge" style={styles.action} onPress={onMerge} />
        </View>
      </View>
    </Card>
  );
}

/** "Different purchase": recent purchases that can still take this refund. */
export function PurchasePicker({
  visible,
  amount,
  candidates,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The refund being attached. */
  amount: Money;
  /** Already filtered to purchases with at least `amountMinor` left to refund. */
  candidates: readonly Expense[];
  onPick: (expense: Expense) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable testID="purchase-picker-backdrop" accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View testID="purchase-picker" style={[styles.sheet, { paddingBottom: insets.bottom + space.base }]}>
        <Text style={styles.eyebrow}>WHICH PURCHASE?</Text>
        {candidates.length === 0 ? (
          <Text style={styles.hint}>{`No purchase in the last 60 days has ${formatMoney(amount)} left to refund.`}</Text>
        ) : null}
        <ScrollView style={styles.list}>
          {candidates.map((expense) => (
            <Pressable
              key={expense.id}
              testID={`purchase-picker-${expense.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${expense.description || 'Purchase'}, ${formatMoney(expense.total)}, ${shortDate(expense.occurredAt)}`}
              onPress={() => {
                haptic('selection');
                onPick(expense);
              }}
              style={styles.option}>
              <View style={styles.info}>
                <Text style={styles.optionText} numberOfLines={1}>{expense.description || 'Purchase'}</Text>
                <Text style={styles.hint}>{shortDate(expense.occurredAt)}</Text>
              </View>
              <Text style={styles.optionAmount}>{formatMoney(expense.total)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md },
  body: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  info: { flex: 1, gap: space.xs },
  hint: { ...type.monoSm, color: colors.textMuted },
  right: { alignItems: 'flex-end', gap: space.xs },
  amount: { ...type.monoLg, color: colors.text },
  amountIn: { color: colors.credit },
  time: { ...type.monoSm, color: colors.textMuted },
  question: { ...type.bodyLg, color: colors.text },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopWidth: 1.5,
    borderColor: colors.border,
    borderTopLeftRadius: radius.control,
    borderTopRightRadius: radius.control,
    paddingHorizontal: layout.screenMargin,
    paddingTop: space.base,
    gap: space.sm,
  },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  list: { maxHeight: 420 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1.5, borderBottomColor: colors.border },
  optionText: { ...type.bodyLg, color: colors.text },
  optionAmount: { ...type.monoMd, color: colors.text },
});
