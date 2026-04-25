import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/i18n/config';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  focused: boolean;
}) {
  return (
    <View style={styles.iconFrame}>
      {props.focused && (
        <>
          <View style={styles.activeHaloGlow} />
          <View style={styles.activeHaloCore} />
        </>
      )}
      <Ionicons size={26} style={styles.iconGlyph} {...props} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useI18n();
  const { usesTimeTheme } = useObsyTheme();

  const tabBarActiveTintColor = '#FFFFFF';
  const tabBarInactiveTintColor = usesTimeTheme ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.62)';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor,
        tabBarInactiveTintColor,
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
        tabBarItemStyle: {
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 8,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('navigation.home'),
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: t('navigation.gallery'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'images' : 'images-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('navigation.insights'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('navigation.settings'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    width: 68,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconGlyph: {
    marginBottom: -2,
  },
  activeHaloGlow: {
    position: 'absolute',
    top: -16,
    width: 64,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.72,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -1 },
  },
  activeHaloCore: {
    position: 'absolute',
    top: -8,
    width: 48,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
