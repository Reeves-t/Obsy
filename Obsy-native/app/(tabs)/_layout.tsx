import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/i18n/config';
import { TopicsTabIcon } from '@/components/topics/TopicsTabIcon';

function ActiveHalo() {
  return (
    <View style={styles.activeHaloWrap} pointerEvents="none">
      {/* Soft spotlight beam falling down from top edge */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.22)',
          'rgba(255,255,255,0.08)',
          'rgba(255,255,255,0.02)',
          'transparent',
        ]}
        locations={[0, 0.28, 0.58, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.activeHaloGlow}
      />
      {/* Bright top-edge pill — the main visible indicator */}
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.85)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.activeHaloCore}
      />
    </View>
  );
}

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  focused: boolean;
}) {
  return (
    <View style={styles.iconFrame}>
      {props.focused && <ActiveHalo />}
      <Ionicons size={26} style={styles.iconGlyph} {...props} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useI18n();
  const { usesTimeTheme } = useObsyTheme();

  const tabBarActiveTintColor = '#FFFFFF';
  const tabBarInactiveTintColor = usesTimeTheme ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.38)';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor,
        tabBarInactiveTintColor,
        headerShown: useClientOnlyValue(false, false),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: 'rgba(255,255,255,0.04)',
          borderTopWidth: 1,
          elevation: 0,
          height: DEFAULT_TAB_BAR_HEIGHT,
          shadowOpacity: 0,
          position: 'absolute',
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={['rgba(5,6,8,0)', 'rgba(5,6,8,0.6)', 'rgba(5,6,8,0.92)']}
            locations={[0, 0.3, 1]}
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarItemStyle: {
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          marginBottom: 8,
        },
      }}
    >
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
        name="topics"
        options={{
          title: t('navigation.topics'),
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconFrame}>
              {focused && <ActiveHalo />}
              <TopicsTabIcon color={color} focused={focused} />
            </View>
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
  activeHaloWrap: {
    position: 'absolute',
    top: -4,
    // Width matches roughly one tab — keeps glow contained and non-blobby
    width: 72,
    height: 46,
    alignItems: 'center',
    overflow: 'visible',
  },
  activeHaloGlow: {
    position: 'absolute',
    top: 0,
    width: 72,
    height: 46,
    borderRadius: 36,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -1 },
  },
  activeHaloCore: {
    position: 'absolute',
    top: 0,
    width: 40,
    height: 2,
    borderRadius: 2,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.6,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
});
