import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getProfile, updateProfile, Profile } from '@/services/profile';
import { AI_TONES, getToneDefinition } from '@/lib/aiTone';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/Colors';
import { ThemeDefinition, getDarkThemes, getLightThemes } from '@/constants/themes';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTimeFormatStore, TimeFormat } from '@/lib/timeFormatStore';
import { useFloatingBackgroundStore, FloatingMode } from '@/lib/floatingBackgroundStore';
import { useAmbientMoodFieldStore } from '@/lib/ambientMoodFieldStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  friend_code: string | null;
  updated_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Row Component
// ─────────────────────────────────────────────────────────────────────────────
interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  title,
  subtitle,
  value,
  onPress,
  showChevron = true,
  danger = false,
  rightElement,
  isLast = false,
}) => {
  const { colors, isLight } = useObsyTheme();

  // Theme-aware colors for settings rows (directly on background, not in cards)
  const iconColor = danger ? '#EF4444' : (isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)');
  const chevronColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const iconBgColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';

  const content = (
    <View style={[
      styles.settingRow,
      !isLast && [styles.settingRowBorder, { borderBottomColor: borderColor }]
    ]}>
      <View style={[
        styles.iconContainer,
        { backgroundColor: iconBgColor },
        danger && styles.iconContainerDanger
      ]}>
        <Ionicons
          name={icon}
          size={18}
          color={iconColor}
        />
      </View>
      <View style={styles.settingContent}>
        <ThemedText style={[styles.settingTitle, { color: isLight ? '#1a1a1a' : '#fff' }, danger && styles.dangerText]}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText style={[styles.settingSubtitle, { color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }]}>{subtitle}</ThemedText>
        )}
      </View>
      {rightElement ? (
        rightElement
      ) : (
        <View style={styles.settingRight}>
          {value && <ThemedText style={[styles.settingValue, { color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }]}>{value}</ThemedText>}
          {showChevron && (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={chevronColor}
            />
          )}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

// ─────────────────────────────────────────────────────────────────────────────
// Section Header Component
// ─────────────────────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; flat?: boolean }> = ({ title, flat = false }) => {
  const { colors, isLight } = useObsyTheme();
  return (
    <View style={flat ? styles.flatSectionHeaderContainer : null}>
      <ThemedText style={[styles.sectionHeader, { color: colors.textTertiary, marginBottom: flat ? 8 : 12 }]}>{title}</ThemedText>
      {flat && <View style={[styles.flatSectionDivider, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]} />}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Floating Backgrounds Inline Component
// ─────────────────────────────────────────────────────────────────────────────
const FloatingBackgroundsInline: React.FC = () => {
  const { colors, isLight } = useObsyTheme();
  const { enabled, mode, toggleEnabled, setMode } = useFloatingBackgroundStore();

  const modes: { id: FloatingMode; label: string }[] = [
    { id: 'obsy-drift', label: 'Obsy Drift' },
    { id: 'static-drift', label: 'Static Drift' },
    { id: 'orbital-float', label: 'Orbital Float' },
    { id: 'parallax-float', label: 'Parallax Float' },
  ];

  const switchTrackFalse = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
  const modeBorderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const selectedTextColor = isLight ? colors.text : '#fff';

  return (
    <View style={styles.floatingInlineContainer}>
      <SettingRow
        icon="images-outline"
        title="Enable Floating Images"
        subtitle="Capture-based background animations"
        showChevron={false}
        rightElement={
          <Switch
            value={enabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: switchTrackFalse, true: Colors.obsy.silver }}
            thumbColor="#fff"
          />
        }
      />

      <View style={[styles.modeListContainer, !enabled && { opacity: 0.4 }]}>
        <ThemedText style={[styles.modeListTitle, { color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }]}>FLOATING STYLE</ThemedText>
        {modes.map((item, index) => {
          const isSelected = mode === item.id;
          const isLast = index === modes.length - 1;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.modeItem,
                !isLast && [styles.modeItemBorder, { borderBottomColor: modeBorderColor }]
              ]}
              onPress={() => enabled && setMode(item.id)}
              activeOpacity={0.7}
              disabled={!enabled}
            >
              <ThemedText style={[
                styles.modeLabel,
                { color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' },
                isSelected && { color: selectedTextColor, fontWeight: '600' }
              ]}>
                {item.label}
              </ThemedText>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.obsy.silver} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Ambient Mood Field Inline Component
// ─────────────────────────────────────────────────────────────────────────────
const AmbientMoodFieldInline: React.FC = () => {
  const { colors, isLight } = useObsyTheme();
  const { enabled, toggleEnabled } = useAmbientMoodFieldStore();

  const switchTrackFalse = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

  return (
    <View style={styles.floatingInlineContainer}>
      <SettingRow
        icon="planet-outline"
        title="Ambient Mood Field"
        subtitle="Subtle week-level mood visualization"
        showChevron={false}
        isLast
        rightElement={
          <Switch
            value={enabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: switchTrackFalse, true: Colors.obsy.silver }}
            thumbColor="#fff"
          />
        }
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Profile Screen
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Theme Swatch Component
// ─────────────────────────────────────────────────────────────────────────────
const ThemeSwatch: React.FC<{
  theme: ThemeDefinition;
  isActive: boolean;
  onPress: () => void;
}> = ({ theme, isActive, onPress }) => {
  const { colors: currentColors, isLight: currentIsLight } = useObsyTheme();
  const labelColor = currentIsLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
  const activeLabelColor = currentIsLight ? '#1A1A1A' : '#FFFFFF';
  const borderColor = isActive
    ? (currentIsLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)')
    : (currentIsLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)');

  return (
    <TouchableOpacity
      style={[styles.themeSwatch, { borderColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Mini preview of the theme */}
      <View style={[styles.themePreview, { backgroundColor: theme.background }]}>
        {/* Corner color dots */}
        <View style={[styles.cornerDot, styles.cornerDotTL, { backgroundColor: theme.cornerColors.topLeft }]} />
        <View style={[styles.cornerDot, styles.cornerDotTR, { backgroundColor: theme.cornerColors.topRight }]} />
        <View style={[styles.cornerDot, styles.cornerDotBL, { backgroundColor: theme.cornerColors.bottomLeft }]} />
        <View style={[styles.cornerDot, styles.cornerDotBR, { backgroundColor: theme.cornerColors.bottomRight }]} />
        {/* Contrast indicator — shows text color treatment */}
        <View style={[
          styles.contrastIndicator,
          { backgroundColor: theme.contrast === 'dark' ? '#FFFFFF' : '#1A1A1A' }
        ]} />
        {isActive && (
          <View style={styles.activeCheck}>
            <Ionicons name="checkmark-circle" size={18} color={theme.contrast === 'dark' ? '#FFFFFF' : '#1A1A1A'} />
          </View>
        )}
      </View>
      <ThemedText style={[
        styles.themeSwatchLabel,
        { color: isActive ? activeLabelColor : labelColor },
        isActive && { fontWeight: '600' },
      ]}>
        {theme.name}
      </ThemedText>
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Theme Picker Component
// ─────────────────────────────────────────────────────────────────────────────
const ThemePicker: React.FC = () => {
  const { themeId, setThemeById, isLight } = useObsyTheme();
  const darkThemes = getDarkThemes();
  const lightThemes = getLightThemes();

  const groupLabelColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)';

  return (
    <View style={styles.themePickerContainer}>
      {/* Dark themes */}
      <ThemedText style={[styles.themeGroupLabel, { color: groupLabelColor }]}>DARK</ThemedText>
      <View style={styles.themeGrid}>
        {darkThemes.map((t) => (
          <ThemeSwatch
            key={t.id}
            theme={t}
            isActive={themeId === t.id}
            onPress={() => setThemeById(t.id)}
          />
        ))}
      </View>

      {/* Light themes */}
      <ThemedText style={[styles.themeGroupLabel, { color: groupLabelColor, marginTop: 16 }]}>LIGHT</ThemedText>
      <View style={styles.themeGrid}>
        {lightThemes.map((t) => (
          <ThemeSwatch
            key={t.id}
            theme={t}
            isActive={themeId === t.id}
            onPress={() => setThemeById(t.id)}
          />
        ))}
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Profile Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, session, isGuest, signOut } = useAuth();
  const { isLight, toggleTheme, colors } = useObsyTheme();
  const { timeFormat, setTimeFormat } = useTimeFormatStore();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toneModalVisible, setToneModalVisible] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Load Profile Data
  // ─────────────────────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      // Load settings profile (AI tone, etc.)
      const settingsData = await getProfile();
      setProfile(settingsData);

      // If signed in, also load user profile from profiles table
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setUserProfile(data as UserProfile);
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ─────────────────────────────────────────────────────────────────────────
  // Avatar Upload
  // ─────────────────────────────────────────────────────────────────────────
  const [avatarTimestamp, setAvatarTimestamp] = useState(Date.now());

  const getAvatarUrl = (path: string | null): string | null => {
    if (!path) return null;
    // If it's already a full URL, return as is
    if (path.startsWith('http')) return path;
    // Construct the public URL with cache-busting timestamp
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?t=${avatarTimestamp}`;
  };

  const handleAvatarPress = async () => {
    if (isGuest) {
      Alert.alert(
        'Sign In Required',
        'Create an account to set a profile picture.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/auth/login') },
        ]
      );
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadAvatar(asset.uri, asset.mimeType);
    }
  };

  const uploadAvatar = async (uri: string, mimeType?: string | null) => {
    if (!user) return;

    setUploadingAvatar(true);
    try {
      // Determine content type and file extension
      const contentType = mimeType || 'image/jpeg';
      const ext = contentType.split('/')[1] || 'jpeg';
      const fileName = `${user.id}/avatar.${ext}`;

      // Fetch the file and get ArrayBuffer (works in React Native)
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      // Upload ArrayBuffer to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Upsert profile with new avatar URL (handles case where profile row doesn't exist)
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          avatar_url: fileName,
          updated_at: new Date().toISOString(),
        });

      if (updateError) throw updateError;

      // Refresh profile and bust cache
      setUserProfile((prev) => prev
        ? { ...prev, avatar_url: fileName }
        : { id: user.id, full_name: null, avatar_url: fileName, friend_code: null, updated_at: new Date().toISOString() }
      );
      setAvatarTimestamp(Date.now());
      Alert.alert('Success', 'Profile picture updated!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };



  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleUpdateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return;
    setProfile({ ...profile, ...updates });
    try {
      await updateProfile(updates);
    } catch (error) {
      console.error('Error updating profile:', error);
      loadProfile();
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            console.error('Error signing out:', error);
          }
        },
      },
    ]);
  };

  const handleExportData = () => {
    Alert.alert('Export Data', 'Your data export will begin shortly.', [{ text: 'OK' }]);
  };



  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Contact Support', 'Please contact support to delete your account.');
          },
        },
      ]
    );
  };

  const handleTimeFormatPress = () => {
    Alert.alert(
      'Time Format',
      'Choose how you want time to be displayed across the app.',
      [
        {
          text: 'System (Recommended)',
          style: timeFormat === 'system' ? 'default' : 'none' as any,
          onPress: () => setTimeFormat('system')
        },
        {
          text: '12-hour (1:30 PM)',
          style: timeFormat === '12h' ? 'default' : 'none' as any,
          onPress: () => setTimeFormat('12h')
        },
        {
          text: '24-hour (13:30)',
          style: timeFormat === '24h' ? 'default' : 'none' as any,
          onPress: () => setTimeFormat('24h')
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const currentTone = getToneDefinition(profile?.ai_tone);
  const avatarUrl = getAvatarUrl(userProfile?.avatar_url || null);
  const displayName = userProfile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest';

  // ─────────────────────────────────────────────────────────────────────────
  // Render Tone Item
  // ─────────────────────────────────────────────────────────────────────────
  const renderToneItem = ({ item }: { item: typeof AI_TONES[0] }) => {
    const isSelected = profile?.ai_tone === item.id;
    return (
      <TouchableOpacity
        style={[styles.toneItem, isSelected && styles.toneItemActive]}
        onPress={() => {
          handleUpdateProfile({ ai_tone: item.id, selected_custom_tone_id: null });
          setToneModalVisible(false);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.toneInfo}>
          <ThemedText style={[styles.toneLabel, isSelected && styles.toneActiveText]}>
            {item.label}
          </ThemedText>
          <ThemedText style={[styles.toneDesc, isSelected && styles.toneActiveText]}>
            {item.shortDescription}
          </ThemedText>
        </View>
        {isSelected && <View style={styles.toneIndicator} />}
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper screenName="profile" hideFloatingBackground>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title" style={[styles.headerTitle, { color: colors.text }]}>Settings</ThemedText>
        </View>

        {/* Guest UI Override */}
        {isGuest ? (
          <View style={styles.guestContainer}>
            <View style={styles.guestIconContainer}>
              <Ionicons name="person-circle-outline" size={80} color={colors.textTertiary} />
            </View>
            <ThemedText type="subtitle" style={[styles.guestTitle, { color: colors.text }]}>
              Sign In to Obsy
            </ThemedText>
            <ThemedText style={[styles.guestSubtitle, { color: colors.textSecondary }]}>
              Back up your memories, sync across devices, and connect with friends.
            </ThemedText>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.signInButtonText}>Sign In or Create Account</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          /* User Profile Section */
          <View style={styles.userSection}>
            {/* Avatar */}
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={handleAvatarPress}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  {isGuest ? (
                    <Ionicons name="person-outline" size={32} color="rgba(255,255,255,0.5)" />
                  ) : (
                    <ThemedText style={styles.avatarText}>
                      {displayName.charAt(0).toUpperCase()}
                    </ThemedText>
                  )}
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              {!isGuest && (
                <View style={styles.avatarBadge}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            {/* User Info */}
            <View style={styles.userInfo}>
              <ThemedText style={[styles.userName, { color: colors.text }]}>
                {isGuest ? 'Guest User' : displayName}
              </ThemedText>
              <ThemedText style={[styles.userSubtitle, { color: colors.textSecondary }]}>
                {isGuest
                  ? "You're using Obsy in guest mode."
                  : 'Your journal flows and insights are synced. Photos stay on-device.'}
              </ThemedText>

              {/* Local Storage Badge */}
              <View style={styles.badgeRow}>
                <View style={[styles.trustBadge, { backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.2)' }]}>
                  <Ionicons name="lock-closed" size={12} color="#34D399" />
                  <ThemedText style={styles.trustBadgeText}>Local-only photo storage</ThemedText>
                </View>
              </View>
              {!isGuest && user?.email && (
                <ThemedText style={[styles.userEmail, { color: colors.textTertiary }]}>{user.email}</ThemedText>
              )}

            </View>
          </View>
        )}

        {/* Guest CTA Card (Removed as it's now the main view) */}

        {/* APPEARANCE */}
        <SectionHeader title="APPEARANCE" flat />
        <View style={styles.flatSection}>
          <ThemePicker />
          <SettingRow
            icon="time-outline"
            title="Time Format"
            subtitle="Choose 12-hour, 24-hour, or system"
            value={timeFormat === 'system' ? 'System' : timeFormat === '12h' ? '12-hour' : '24-hour'}
            onPress={handleTimeFormatPress}
            isLast
          />
        </View>

        {/* AI PERSONALIZATION */}
        <SectionHeader title="AI PERSONALIZATION" flat />
        <View style={styles.flatSection}>
          <SettingRow
            icon="sparkles-outline"
            title="Insight Tone"
            subtitle="Choose how Obsy narrates your day"
            value={currentTone.label}
            onPress={() => setToneModalVisible(true)}
          />
          <SettingRow
            icon="calendar-outline"
            title="Daily Insights"
            subtitle="Generate a summary every day"
            showChevron={false}
            rightElement={
              <Switch
                value={profile?.ai_auto_daily_insights ?? true}
                onValueChange={(val) => handleUpdateProfile({ ai_auto_daily_insights: val })}
                trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                thumbColor={isLight ? '#1a1a1a' : '#fff'}
              />
            }
          />
          <SettingRow
            icon="book-outline"
            title="Use Journal Entries"
            subtitle="Include your notes in analysis"
            showChevron={false}
            isLast
            rightElement={
              <Switch
                value={profile?.ai_use_journal_in_insights ?? true}
                onValueChange={(val) => handleUpdateProfile({ ai_use_journal_in_insights: val })}
                trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                thumbColor={isLight ? '#1a1a1a' : '#fff'}
              />
            }
          />
        </View>

        {/* VISUAL ATMOSPHERE */}
        <SectionHeader title="VISUAL ATMOSPHERE" flat />
        <View style={styles.flatSection}>
          <FloatingBackgroundsInline />
          <AmbientMoodFieldInline />
        </View>

        {/* FEATURES */}
        <SectionHeader title="FEATURES" flat />
        <View style={styles.flatSection}>
          <SettingRow
            icon="newspaper-outline"
            title="Weekly Digest"
            subtitle="Coming soon"
            onPress={() => { }}
          />
          <SettingRow
            icon="pricetag-outline"
            title="Tag Reflections"
            subtitle="Generate insights from topics"
            onPress={() => { }}
          />
          <SettingRow
            icon="cube-outline"
            title="Object Stories"
            subtitle="Short stories about your objects"
            onPress={() => { }}
            isLast
          />
        </View>

        {/* ACCOUNT */}
        {user && (
          <>
            <SectionHeader title="ACCOUNT" flat />
            <View style={styles.flatSection}>
              <SettingRow
                icon="download-outline"
                title="Export Data"
                onPress={handleExportData}
              />
              <SettingRow
                icon="trash-outline"
                title="Delete Account"
                danger
                onPress={handleDeleteAccount}
              />
              <SettingRow
                icon="log-out-outline"
                title="Sign Out"
                onPress={handleSignOut}
                isLast
              />
            </View>
          </>
        )}

        {/* DATA & PRIVACY */}
        <SectionHeader title="DATA & PRIVACY" flat />
        <View style={styles.flatSection}>
          <SettingRow
            icon="shield-checkmark-outline"
            title="Data Trust Foundation"
            subtitle="Photos stay on-device. AI only sees them if you opt-in per capture."
            onPress={() => { }}
          />
          <SettingRow
            icon="trash-bin-outline"
            title="Clear Local Data"
            subtitle="Remove all photos and cached insights from this device."
            onPress={() => {
              Alert.alert(
                'Clear Local Data',
                'This will permanently delete all photos and cached insights on this device. Your journal entries in the cloud will remain.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear All', style: 'destructive', onPress: () => { /* Handle clear */ } }
                ]
              );
            }}
          />
          <SettingRow
            icon="document-text-outline"
            title="Privacy Policy"
            onPress={() => { }}
            isLast
          />
        </View>

        {/* SUPPORT & ABOUT */}
        <SectionHeader title="SUPPORT & ABOUT" flat />
        <View style={styles.flatSection}>
          <SettingRow
            icon="help-circle-outline"
            title="FAQ / Help"
            onPress={() => { }}
          />
          <SettingRow
            icon="mail-outline"
            title="Contact Support"
            onPress={() => { }}
          />
          <SettingRow
            icon="star-outline"
            title="Rate Obsy"
            onPress={() => { }}
            isLast
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: colors.textTertiary }]}>Obsy v1.0.0 • Built with ❤️</ThemedText>
        </View>
      </ScrollView>

      {/* Tone Selection Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={toneModalVisible}
        onRequestClose={() => setToneModalVisible(false)}
      >
        <BlurView intensity={90} tint="dark" style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <ThemedText style={styles.modalTitle}>Select AI Tone</ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                Switch tones any time. Regenerate insights to apply.
              </ThemedText>
            </View>
            <TouchableOpacity onPress={() => setToneModalVisible(false)}>
              <Ionicons name="close-circle" size={32} color={Colors.obsy.silver} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={AI_TONES}
            renderItem={renderToneItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.toneList}
            showsVerticalScrollIndicator={false}
          />
        </BlurView>
      </Modal>
    </ScreenWrapper >
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '600',
  },

  // User Section
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.obsy.silver,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.obsy.silver,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  userSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  trustBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34D399', // Emerald
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  friendCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  friendCodeLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  friendCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  friendCodeText: {
    fontSize: 12,
    color: '#fff',
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
  },
  generateCodeButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  generateCodeText: {
    fontSize: 12,
    color: Colors.obsy.silver,
    fontWeight: '600',
  },

  // Guest UI
  guestContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    marginBottom: 40,
  },
  guestIconContainer: {
    marginBottom: 16,
  },
  guestTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  guestSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  signInButton: {
    backgroundColor: Colors.obsy.silver,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  signInButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  guestCta: {
    marginBottom: 24,
  },
  guestCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  guestCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestCtaText: {
    flex: 1,
  },
  guestCtaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  guestCtaSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 16,
  },

  // Section Header
  sectionHeader: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
    marginTop: 8,
  },

  // Card
  card: {
    marginBottom: 24,
  },

  // Flat Styles
  flatSection: {
    marginBottom: 24,
  },
  flatSectionHeaderContainer: {
    marginTop: 24,
    marginBottom: 4,
  },
  flatSectionDivider: {
    height: 1,
    width: '100%',
    marginBottom: 8,
  },

  // Floating Inline
  floatingInlineContainer: {
    marginTop: 0,
  },
  modeListContainer: {
    paddingLeft: 44, // Align with setting items text
    paddingBottom: 8,
  },
  modeListTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  modeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingRight: 16,
  },
  modeItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modeLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  settingSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  dangerText: {
    color: '#EF4444',
  },

  // Theme Picker
  themePickerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  themeGroupLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  themeSwatch: {
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 6,
    paddingBottom: 8,
    width: 74,
  },
  themePreview: {
    width: 60,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cornerDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    opacity: 0.85,
  },
  cornerDotTL: {
    top: 4,
    left: 4,
  },
  cornerDotTR: {
    top: 4,
    right: 4,
  },
  cornerDotBL: {
    bottom: 4,
    left: 4,
  },
  cornerDotBR: {
    bottom: 4,
    right: 4,
  },
  contrastIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 12,
    height: 3,
    borderRadius: 1.5,
    marginTop: -1.5,
    marginLeft: -6,
    opacity: 0.5,
  },
  activeCheck: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -9,
    marginLeft: -9,
  },
  themeSwatchLabel: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 16,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },

  // Modal
  modalContainer: {
    flex: 1,
    paddingTop: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  toneList: {
    padding: 20,
    paddingBottom: 40,
  },
  toneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  toneItemActive: {
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderColor: 'rgba(52,211,153,0.5)',
  },
  toneInfo: {
    flex: 1,
    gap: 4,
  },
  toneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  toneDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  toneActiveText: {
    color: '#34D399',
  },
  toneIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
    marginLeft: 12,
  },
});
