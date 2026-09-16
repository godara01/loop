import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { TabDock } from '@/components/ui/tab-dock';
import { UndoSnackbar } from '@/components/ui/undo-snackbar';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabDock {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
        <Tabs.Screen name="index" options={{ title: 'Orbit' }} />
        <Tabs.Screen name="activity" options={{ title: 'Ledger' }} />
        <Tabs.Screen name="profile" options={{ title: 'You' }} />
      </Tabs>
      <UndoSnackbar />
    </View>
  );
}
