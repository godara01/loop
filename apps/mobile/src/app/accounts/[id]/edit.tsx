import { useLocalSearchParams } from 'expo-router';

import { AccountEditorScreen } from '@/features/accounts';

export default function EditAccount() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountEditorScreen accountId={id} />;
}
