import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '@/components/ui';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: ({ color }) => <Icon name="white-balance-sunny" color={color as string} size={24} /> }}
      />
      <Tabs.Screen
        name="trackers"
        options={{ title: 'Trackers', tabBarIcon: ({ color }) => <Icon name="view-grid-outline" color={color as string} size={24} /> }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Insights', tabBarIcon: ({ color }) => <Icon name="chart-box-outline" color={color as string} size={24} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon name="account-circle-outline" color={color as string} size={24} /> }}
      />
    </Tabs>
  );
}
