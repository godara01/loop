import { useLocalSearchParams } from 'expo-router';

import { ExpenseEntryScreen } from '@/features/expenses';

export default function RefundExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseEntryScreen mode="refund" expenseId={id} />;
}