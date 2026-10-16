import { useLocalSearchParams } from 'expo-router';

import { AccountDetailScreen } from '@/features/accounts';

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountDetailScreen accountId={id} />;
}
