import { useLocalSearchParams } from 'expo-router';

import { ExpenseEntryScreen } from '@/features/expenses';

export default function EditExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseEntryScreen mode="edit" expenseId={id} />;
}
