import { useLocalSearchParams } from 'expo-router';

import { ApprovePendingScreen } from '@/features/inbox';

export default function ApprovePendingRoute() {
  const { pendingId } = useLocalSearchParams<{ pendingId: string }>();
  return <ApprovePendingScreen pendingId={pendingId} />;
}
