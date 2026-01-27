import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import Colors from '@/constants/Colors';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useObsyTheme } from '@/contexts/ThemeContext';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { isDark, colors } = useObsyTheme();
  // Use our theme context instead of system color scheme
  const themeKey = isDark ? 'dark' : 'light';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[themeKey].tint,
        tabBarInactiveTintColor: Colors[themeKey].tabIconDefault,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, false),
        tabBarStyle: {
          backgroundColor: isDark ? Colors.dark.background : Colors.light.background,
          borderTopColor: colors.glassBorder,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'images' : 'images-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, focused }) => <TabBarIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Settings',
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
