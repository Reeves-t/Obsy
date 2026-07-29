import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  UIManager,
  LayoutAnimation,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { DEFAULT_TAB_BAR_HEIGHT, ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { AURORA_BACKGROUNDS, AURORA_BACKGROUND_ORDER } from '@/constants/auroraBackgrounds';
import { ORB_WAVES, ORB_WAVE_ORDER } from '@/constants/auroraOrbs';
import { LinearGradient } from 'expo-linear-gradient';
import { getProfile, updateProfile, Profile } from '@/services/profile';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useTimeFormatStore } from '@/lib/timeFormatStore';
import { useI18n } from '@/i18n/config';
import * as WebBrowser from 'expo-web-browser';
import { exportUserData } from '@/services/export';
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  SUPPORT_URL,
  DATA_CONTROLS_URL,
  SUPPORT_EMAIL,
  APP_STORE_REVIEW_URL,
} from '@/constants/legal';
import { clearLocalData, getLocalDataUsage, formatBytes } from '@/services/localData';
import {
  AVAILABLE_NOTIFICATION_TYPES,
  type NotificationType,
} from '@/constants/notifications';
import type { NotificationPreferences } from '@/services/notificationPreferences';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { restorePurchases } from '@/lib/revenuecat';
import { submitRecommendation, MAX_RECOMMENDATION_LENGTH } from '@/services/recommendations';

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

// Enable smooth expand/collapse animations on Android (no-op / default on iOS).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification settings support
// ─────────────────────────────────────────────────────────────────────────────

/** Icon per notification type, keyed to the registry in constants/notifications. */
const NOTIFICATION_ROW_ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  daily_reminder: 'alarm-outline',
  streak: 'flame-outline',
  monthly_insight: 'sparkles-outline',
  shared_link_pending: 'link-outline',
};

/** Which `NotificationPreferences` field each type's toggle writes. */
const NOTIFICATION_PREF_KEYS: Record<NotificationType, keyof NotificationPreferences> = {
  daily_reminder: 'dailyReminder',
  streak: 'streak',
  monthly_insight: 'monthlyInsight',
  shared_link_pending: 'sharedLinkPending',
};

// Preset times instead of a picker dependency. These cover the realistic range
// for a journaling reminder and an overnight quiet window without pulling in
// @react-native-community/datetimepicker for two fields.
const REMINDER_TIME_OPTIONS = ['08:00', '12:00', '17:00', '19:00', '20:00', '21:00'];
const QUIET_START_OPTIONS = ['20:00', '21:00', '22:00', '23:00', '00:00'];
const QUIET_END_OPTIONS = ['06:00', '07:00', '08:00', '09:00', '10:00'];

/** "20:00" → "8:00 PM". Display only; storage stays 24-hour. */
function formatTimeLabel(value: string): string {
  const [hourStr, minute] = value.split(':');
  const hour = Number(hourStr);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${suffix}`;
}

/** A settings row whose value is chosen from a short list of preset times. */
const TimeChoiceRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  isLight: boolean;
  isLast?: boolean;
}> = ({ icon, title, options, value, onChange, isLight, isLast = false }) => {
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const iconBgColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';
  const iconColor = isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';

  return (
    <View
      style={[
        styles.settingRow,
        { flexDirection: 'column', alignItems: 'stretch' },
        !isLast && [styles.settingRowBorder, { borderBottomColor: borderColor }],
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={styles.settingContent}>
          <ThemedText style={[styles.settingTitle, { color: isLight ? '#1a1a1a' : '#fff' }]}>
            {title}
          </ThemedText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingLeft: 4 }}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: selected
                  ? (isLight ? '#1a1a1a' : '#fff')
                  : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)'),
              }}
            >
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: selected
                    ? (isLight ? '#fff' : '#1a1a1a')
                    : (isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)'),
                }}
              >
                {formatTimeLabel(option)}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

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
  const { isLight } = useObsyTheme();

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
// Collapsible Section — every settings group starts collapsed; tap to expand
// ─────────────────────────────────────────────────────────────────────────────
const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const { colors, isLight } = useObsyTheme();
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.collapsibleSection}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={toggle} activeOpacity={0.7}>
        <ThemedText style={[styles.collapsibleTitle, { color: colors.textTertiary }]}>{title}</ThemedText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
      </TouchableOpacity>
      <View style={[styles.flatSectionDivider, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]} />
      {expanded && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Pill Dropdown (Appearance) — shows the selected option; expands to slim pills
// ─────────────────────────────────────────────────────────────────────────────
const PillDropdown: React.FC<{
  label: string;
  selectedSwatch: React.ReactNode;
  selectedLabel: string;
  children: React.ReactNode;
}> = ({ label, selectedSwatch, selectedLabel, children }) => {
  const { colors, isLight } = useObsyTheme();
  const [open, setOpen] = useState(false);
  const muted = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)';

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => !prev);
  };

  return (
    <View style={styles.pillDropdown}>
      <TouchableOpacity style={styles.pillDropdownHeader} onPress={toggle} activeOpacity={0.7}>
        <ThemedText style={[styles.pillDropdownLabel, { color: colors.text }]}>{label}</ThemedText>
        <View style={styles.pillDropdownValue}>
          {selectedSwatch}
          <ThemedText style={[styles.pillDropdownValueText, { color: muted }]}>{selectedLabel}</ThemedText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={muted} />
        </View>
      </TouchableOpacity>
      {open && <View style={styles.pillOptionsRow}>{children}</View>}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations Block — "tell us what you want to see in the app"
// ─────────────────────────────────────────────────────────────────────────────
const RecommendationsBlock: React.FC = () => {
  const { colors, isLight } = useObsyTheme();
  const { isGuest } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSend = text.trim().length > 0 && !submitting;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account to send us your ideas.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/auth/login') },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      await submitRecommendation(trimmed);
      setText('');
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (error) {
      console.error('Error submitting recommendation:', error);
      Alert.alert('Could not send', 'Something went wrong. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const inputBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)';

  return (
    <View style={styles.recommendBlock}>
      <ThemedText style={[styles.recommendTitle, { color: colors.text }]}>Tell us what you want to see in Obsy</ThemedText>
      <ThemedText style={[styles.recommendSubtitle, { color: colors.textSecondary }]}>
        Your ideas shape what we build next — share a feature, a fix, or a wish.
      </ThemedText>
      <TextInput
        style={[styles.recommendInput, { backgroundColor: inputBg, borderColor: inputBorder, color: colors.text }]}
        placeholder="I'd love it if Obsy could…"
        placeholderTextColor={isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MAX_RECOMMENDATION_LENGTH}
        textAlignVertical="top"
      />
      <TouchableOpacity
        style={[styles.recommendButton, { opacity: canSend ? 1 : 0.5 }]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#000" />
        ) : (
          <ThemedText style={styles.recommendButtonText}>{sent ? 'Sent — thank you!' : 'Send'}</ThemedText>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Profile Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, isGuest, signOut } = useAuth();
  const { isLight, colors, auroraBackground, setAuroraBackground, orbWave, setOrbWave, ctaButtonStyle, setCtaButtonStyle } = useObsyTheme();
  const { timeFormat, setTimeFormat } = useTimeFormatStore();
  const { t, languageLabel } = useI18n();
  const router = useRouter();

  const {
    preferences: notificationPreferences,
    loading: notificationsLoading,
    busy: notificationsBusy,
    update: updateNotificationPreference,
    setEnabled: setNotificationsEnabled,
  } = useNotificationSettings(isGuest);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Load Profile Data
  // ─────────────────────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
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

  const handleExportData = async () => {
    if (!user) {
      Alert.alert('Export Data', 'You need to be signed in to export your data.');
      return;
    }
    try {
      await exportUserData(user.id);
    } catch (error) {
      console.error('Error exporting data:', error);
      Alert.alert('Export Failed', 'We could not export your data. Please try again.');
    }
  };

  const openLegal = (url: string) => {
    WebBrowser.openBrowserAsync(url);
  };

  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  const handleContactSupport = async () => {
    // Pre-fill the details support always has to ask for anyway.
    const subject = `Obsy support request (v${appVersion})`;
    const body = [
      '',
      '',
      '—',
      `App version: ${appVersion}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Account: ${isGuest ? 'signed out' : user?.email ?? 'signed in'}`,
    ].join('\n');
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
        return;
      }
    } catch (error) {
      console.warn('Could not open mail client:', error);
    }
    // No mail client configured — fall back to the web help center.
    Alert.alert(
      'Contact support',
      `Email us at ${SUPPORT_EMAIL}, or open the help center for troubleshooting steps.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open help center', onPress: () => openLegal(SUPPORT_URL) },
      ],
    );
  };

  const handleRateObsy = async () => {
    try {
      await Linking.openURL(APP_STORE_REVIEW_URL);
    } catch (error) {
      console.error('Error opening App Store review:', error);
      Alert.alert('Could not open the App Store', 'Please try again from the App Store app.');
    }
  };

  const handleClearLocalData = async () => {
    const usage = await getLocalDataUsage();

    if (usage.fileCount === 0) {
      Alert.alert('Nothing to clear', 'There are no photos stored on this device.');
      return;
    }

    // Signed-out users have no cloud copy — their entries are the local rows,
    // so say plainly that the photos are unrecoverable.
    const message = isGuest
      ? `This permanently deletes ${usage.fileCount} photo${usage.fileCount === 1 ? '' : 's'} (${formatBytes(usage.bytes)}) from this device.\n\nYou are not signed in, so these photos exist nowhere else. They cannot be recovered. Your entries will remain, without their images.`
      : `This permanently deletes ${usage.fileCount} photo${usage.fileCount === 1 ? '' : 's'} (${formatBytes(usage.bytes)}) from this device.\n\nYour journal entries stay in the cloud, but any photo you have not backed up cannot be recovered. Saved insight cards are kept.`;

    Alert.alert('Clear local data', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await clearLocalData({ resetCaptureState: !isGuest });
            Alert.alert(
              'Local data cleared',
              `Removed ${result.filesRemoved} file${result.filesRemoved === 1 ? '' : 's'} and freed ${formatBytes(result.bytesFreed)}.`,
            );
          } catch (error) {
            console.error('Error clearing local data:', error);
            Alert.alert(
              'Could not clear local data',
              'Something went wrong and your local data was not fully removed. Please try again.',
            );
          }
        },
      },
    ]);
  };

  const handleRestorePurchases = async () => {
    try {
      const res = await restorePurchases();
      if (res.ok && res.isPlus) {
        Alert.alert('Purchases restored', 'Your Obsy Plus subscription is active.');
      } else if (res.ok) {
        Alert.alert('Nothing to restore', "We didn't find an active subscription on this account.");
      } else {
        Alert.alert('Restore failed', res.error ?? 'Please try again.');
      }
    } catch (error) {
      console.error('Error restoring purchases:', error);
      Alert.alert('Restore failed', 'Please try again.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your data (entries, insights, photos, voice notes). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.functions.invoke('delete-account');
              if (error) throw error;
              // Account + data are gone; sign out locally and return to auth.
              await signOut();
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert(
                'Deletion Failed',
                'We could not delete your account. Please try again, or contact support if the problem persists.'
              );
            }
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

  const avatarUrl = getAvatarUrl(userProfile?.avatar_url || null);
  const displayName = userProfile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest';
  const themeOptionBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
  const themeOptionBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const themeOptionActiveBg = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  const themeOptionActiveBorder = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)';
  const themeOptionIconBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
  const themeOptionMuted = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)';

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper screenName="profile" bottomInset={DEFAULT_TAB_BAR_HEIGHT}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title" style={[styles.headerTitle, { color: colors.text }]}>{t('settings.title')}</ThemedText>
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
        <CollapsibleSection title={t('settings.appearance')}>
          <PillDropdown
            label="Background"
            selectedSwatch={<View style={[styles.pillDot, { backgroundColor: AURORA_BACKGROUNDS[auroraBackground].swatch }]} />}
            selectedLabel={AURORA_BACKGROUNDS[auroraBackground].label}
          >
            {AURORA_BACKGROUND_ORDER.map((key) => {
              const palette = AURORA_BACKGROUNDS[key];
              const isSelected = auroraBackground === key;
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.85}
                  onPress={() => setAuroraBackground(key)}
                  style={[
                    styles.colorPill,
                    {
                      backgroundColor: isSelected ? themeOptionActiveBg : themeOptionBg,
                      borderColor: isSelected ? Colors.obsy.silver : themeOptionBorder,
                    },
                  ]}
                >
                  <View style={[styles.pillDot, { backgroundColor: palette.swatch }]} />
                  <ThemedText style={[styles.pillText, { color: isSelected ? colors.text : themeOptionMuted }]}>
                    {palette.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </PillDropdown>

          <PillDropdown
            label="Aurora"
            selectedSwatch={
              <LinearGradient
                colors={[`rgb(${ORB_WAVES[orbWave].a})`, `rgb(${ORB_WAVES[orbWave].b})`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pillDot}
              />
            }
            selectedLabel={ORB_WAVES[orbWave].label}
          >
            {ORB_WAVE_ORDER.map((key) => {
              const wave = ORB_WAVES[key];
              const isSelected = orbWave === key;
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.85}
                  onPress={() => setOrbWave(key)}
                  style={[
                    styles.colorPill,
                    {
                      backgroundColor: isSelected ? themeOptionActiveBg : themeOptionBg,
                      borderColor: isSelected ? Colors.obsy.silver : themeOptionBorder,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[`rgb(${wave.a})`, `rgb(${wave.b})`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.pillDot}
                  />
                  <ThemedText style={[styles.pillText, { color: isSelected ? colors.text : themeOptionMuted }]}>
                    {wave.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </PillDropdown>

          <View style={styles.buttonStyleRow}>
            <ThemedText style={[styles.pillDropdownLabel, { color: colors.text }]}>Button style</ThemedText>
            <View style={styles.segmentRow}>
              {(['reflective', 'matte'] as const).map((style) => {
                const isSelected = ctaButtonStyle === style;
                return (
                  <TouchableOpacity
                    key={style}
                    activeOpacity={0.85}
                    onPress={() => setCtaButtonStyle(style)}
                    style={[
                      styles.segmentPill,
                      {
                        backgroundColor: isSelected ? themeOptionActiveBg : themeOptionBg,
                        borderColor: isSelected ? themeOptionActiveBorder : themeOptionBorder,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.segmentLabel, { color: isSelected ? colors.text : themeOptionMuted }]}>
                      {style === 'reflective' ? 'Reflective' : 'Matte'}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <SettingRow
            icon="language-outline"
            title={t('settings.languageTitle')}
            subtitle={t('settings.languageSubtitle')}
            value={languageLabel}
            onPress={() => router.push('/language')}
          />
          <SettingRow
            icon="time-outline"
            title="Time Format"
            subtitle="Choose 12-hour, 24-hour, or system"
            value={timeFormat === 'system' ? 'System' : timeFormat === '12h' ? '12-hour' : '24-hour'}
            onPress={handleTimeFormatPress}
            isLast
          />
        </CollapsibleSection>

        {/* AI PERSONALIZATION */}
        <CollapsibleSection title="AI PERSONALIZATION">
          <SettingRow
            icon="flash-off-outline"
            title="AI-Free Mode"
            subtitle="Disable AI-generated content across Obsy"
            showChevron={false}
            rightElement={
              <Switch
                value={profile?.ai_free_mode ?? false}
                onValueChange={(val) => handleUpdateProfile({ ai_free_mode: val })}
                trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                thumbColor={isLight ? '#1a1a1a' : '#fff'}
              />
            }
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
                disabled={profile?.ai_free_mode ?? false}
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
                disabled={profile?.ai_free_mode ?? false}
                trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                thumbColor={isLight ? '#1a1a1a' : '#fff'}
              />
            }
          />
        </CollapsibleSection>

        {/* NOTIFICATIONS */}
        <CollapsibleSection title="NOTIFICATIONS">
          {isGuest ? (
            <SettingRow
              icon="notifications-off-outline"
              title="Sign in to use notifications"
              subtitle="Reminders are delivered to your account, so they need one."
              showChevron={false}
              isLast
            />
          ) : (
            <>
              <SettingRow
                icon="notifications-outline"
                title="Push notifications"
                subtitle="Reminders, streaks, and monthly insights."
                showChevron={false}
                rightElement={
                  notificationsLoading ? (
                    <ActivityIndicator size="small" color={isLight ? '#1a1a1a' : '#fff'} />
                  ) : (
                    <Switch
                      value={notificationPreferences.notificationsEnabled}
                      onValueChange={setNotificationsEnabled}
                      disabled={notificationsBusy}
                      trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                      thumbColor={isLight ? '#1a1a1a' : '#fff'}
                    />
                  )
                }
                isLast={!notificationPreferences.notificationsEnabled}
              />

              {notificationPreferences.notificationsEnabled && (
                <>
                  {AVAILABLE_NOTIFICATION_TYPES.map((type) => (
                    <SettingRow
                      key={type.id}
                      icon={NOTIFICATION_ROW_ICONS[type.id]}
                      title={type.label}
                      subtitle={type.description}
                      showChevron={false}
                      rightElement={
                        <Switch
                          value={notificationPreferences[NOTIFICATION_PREF_KEYS[type.id]] as boolean}
                          onValueChange={(val) =>
                            updateNotificationPreference({ [NOTIFICATION_PREF_KEYS[type.id]]: val })
                          }
                          trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                          thumbColor={isLight ? '#1a1a1a' : '#fff'}
                        />
                      }
                    />
                  ))}

                  {notificationPreferences.dailyReminder && (
                    <TimeChoiceRow
                      icon="time-outline"
                      title="Reminder time"
                      options={REMINDER_TIME_OPTIONS}
                      value={notificationPreferences.dailyReminderTime}
                      onChange={(val) => updateNotificationPreference({ dailyReminderTime: val })}
                      isLight={isLight}
                    />
                  )}

                  <SettingRow
                    icon="moon-outline"
                    title="Quiet hours"
                    subtitle="Hold notifications overnight."
                    showChevron={false}
                    rightElement={
                      <Switch
                        value={notificationPreferences.quietHoursEnabled}
                        onValueChange={(val) => updateNotificationPreference({ quietHoursEnabled: val })}
                        trackColor={{ false: isLight ? 'rgba(0,0,0,0.1)' : '#3e3e3e', true: Colors.obsy.silver }}
                        thumbColor={isLight ? '#1a1a1a' : '#fff'}
                      />
                    }
                    isLast={!notificationPreferences.quietHoursEnabled}
                  />

                  {notificationPreferences.quietHoursEnabled && (
                    <>
                      <TimeChoiceRow
                        icon="cloudy-night-outline"
                        title="Quiet from"
                        options={QUIET_START_OPTIONS}
                        value={notificationPreferences.quietHoursStart}
                        onChange={(val) => updateNotificationPreference({ quietHoursStart: val })}
                        isLight={isLight}
                      />
                      <TimeChoiceRow
                        icon="sunny-outline"
                        title="Quiet until"
                        options={QUIET_END_OPTIONS}
                        value={notificationPreferences.quietHoursEnd}
                        onChange={(val) => updateNotificationPreference({ quietHoursEnd: val })}
                        isLight={isLight}
                        isLast
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </CollapsibleSection>

        {/* ARCHIVE */}
        <CollapsibleSection title="ARCHIVE">
          <SettingRow
            icon="archive-outline"
            title="Archive"
            subtitle="Browse all past insights by type"
            onPress={() => router.push('/archive')}
            isLast
          />
        </CollapsibleSection>

        {/* ACCOUNT */}
        {user && (
          <CollapsibleSection title="ACCOUNT">
            <SettingRow
              icon="refresh-outline"
              title="Restore Purchases"
              subtitle="Restore an active Obsy Plus subscription."
              onPress={handleRestorePurchases}
            />
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
          </CollapsibleSection>
        )}

        {/* DATA & PRIVACY */}
        <CollapsibleSection title="DATA & PRIVACY">
          <SettingRow
            icon="shield-checkmark-outline"
            title="Data Trust Foundation"
            subtitle="Photos stay on-device. AI only sees them if you opt-in per capture."
            onPress={() => openLegal(DATA_CONTROLS_URL)}
          />
          <SettingRow
            icon="trash-bin-outline"
            title="Clear Local Data"
            subtitle="Remove photos stored on this device."
            onPress={handleClearLocalData}
          />
          <SettingRow
            icon="document-text-outline"
            title="Privacy Policy"
            onPress={() => openLegal(PRIVACY_POLICY_URL)}
          />
          <SettingRow
            icon="reader-outline"
            title="Terms of Use"
            onPress={() => openLegal(TERMS_OF_SERVICE_URL)}
            isLast
          />
        </CollapsibleSection>

        {/* SUPPORT & ABOUT */}
        <CollapsibleSection title="SUPPORT & ABOUT">
          <SettingRow
            icon="help-circle-outline"
            title="FAQ / Help"
            onPress={() => openLegal(SUPPORT_URL)}
          />
          <SettingRow
            icon="mail-outline"
            title="Contact Support"
            onPress={handleContactSupport}
          />
          <SettingRow
            icon="star-outline"
            title="Rate Obsy"
            onPress={handleRateObsy}
          />
          <SettingRow
            icon="information-circle-outline"
            title="Version"
            value={appVersion}
            showChevron={false}
            isLast
          />
        </CollapsibleSection>

        {/* RECOMMENDATIONS */}
        <RecommendationsBlock />

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: colors.textTertiary }]}>Obsy v1.0.0 • Built with ❤️</ThemedText>
        </View>
      </ScrollView>
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

  // Collapsible Section
  collapsibleSection: {
    marginBottom: 4,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginTop: 8,
  },
  collapsibleTitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  collapsibleBody: {
    marginTop: 4,
    marginBottom: 12,
  },
  flatSectionDivider: {
    height: 1,
    width: '100%',
    marginBottom: 8,
  },

  // Appearance — slim pill dropdowns
  pillDropdown: {
    paddingVertical: 4,
  },
  pillDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  pillDropdownLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  pillDropdownValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillDropdownValueText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pillOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 6,
  },
  colorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  buttonStyleRow: {
    paddingVertical: 10,
    gap: 10,
  },

  // Recommendations
  recommendBlock: {
    marginTop: 28,
    marginBottom: 8,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  recommendTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  recommendSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  recommendInput: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  recommendButton: {
    marginTop: 12,
    backgroundColor: Colors.obsy.silver,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
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

  // Button style segment
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
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
});
