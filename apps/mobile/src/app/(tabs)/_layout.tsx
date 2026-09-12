import { Tabs } from 'expo-router';

import { TabDock } from '@/components/ui/tab-dock';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabDock {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
      <Tabs.Screen name="index" options={{ title: 'Orbit' }} />
      <Tabs.Screen name="squads" options={{ title: 'Squads' }} />
      <Tabs.Screen name="activity" options={{ title: 'Ledger' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
