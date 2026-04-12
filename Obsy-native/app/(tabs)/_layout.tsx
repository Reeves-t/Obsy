import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useI18n } from '@/i18n/config';

const TAB_BAR_FOREGROUND = '#000000';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_BAR_FOREGROUND,
        tabBarInactiveTintColor: TAB_BAR_FOREGROUND,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, false),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: DEFAULT_TAB_BAR_HEIGHT,
          shadowOpacity: 0,
          position: 'absolute',
        },
        tabBarLabelStyle: {
          color: TAB_BAR_FOREGROUND,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('navigation.home'),
          headerShown: false,
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: t('navigation.gallery'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'images' : 'images-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('navigation.insights'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('navigation.settings'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} />,
        }}
      />
      {/* Hide the 'two' screen from the tab bar if it still exists in the file system but shouldn't be a tab */}
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
