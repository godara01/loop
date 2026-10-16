import { useLocalSearchParams } from 'expo-router';

import { AccountEditorScreen } from '@/features/accounts';

export default function NewAccount() {
  const { suggest } = useLocalSearchParams<{ suggest?: string }>();
  return <AccountEditorScreen suggestCash={suggest === 'cash'} />;
}
