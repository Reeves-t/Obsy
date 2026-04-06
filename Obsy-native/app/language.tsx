import React from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/i18n/config';
import { LANGUAGE_OPTIONS, type SupportedLanguageCode } from '@/i18n/languages';

export default function LanguageScreen() {
  const { colors, isLight } = useObsyTheme();
  const { language, setLanguage, t } = useI18n();

  const onSelect = async (code: SupportedLanguageCode) => {
    await setLanguage(code);
  };

  return (
    <ScreenWrapper screenName="profile" hideFloatingBackground>
      <View style={styles.container}>
        <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
          {t('settings.languageTitle')}
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('settings.languageSubtitle')}
        </ThemedText>

        <FlatList
          data={LANGUAGE_OPTIONS}
          keyExtractor={(item) => item.code}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const selected = language === item.code;
            const isComingSoon = item.tier === 'tier2';
            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  {
                    borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  },
                  isComingSoon && styles.rowDisabled,
                ]}
                onPress={() => !isComingSoon && onSelect(item.code)}
                activeOpacity={isComingSoon ? 1 : 0.7}
              >
                <View style={styles.rowText}>
                  <ThemedText style={[styles.native, { color: isComingSoon ? colors.textSecondary : colors.text }]}>{item.nativeName}</ThemedText>
                  <ThemedText style={[styles.name, { color: colors.textSecondary }]}>
                    {item.name}{isComingSoon ? ' — coming soon' : ''}
                  </ThemedText>
                </View>
                {selected && !isComingSoon && <Ionicons name="checkmark" size={20} color={colors.text} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
  },
  list: {
    marginTop: 20,
  },
  listContent: {
    paddingBottom: 40,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    gap: 4,
  },
  native: {
    fontSize: 16,
    fontWeight: '500',
  },
  name: {
    fontSize: 12,
  },
  rowDisabled: {
    opacity: 0.45,
  },
});
