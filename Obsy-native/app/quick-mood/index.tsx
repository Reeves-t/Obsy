import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';
import { MOODS } from '@/constants/Moods';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';

export default function QuickMoodScreen() {
  const router = useRouter();
  const { createJournalEntry } = useCaptureStore();
  const { user } = useAuth();
  const { getMoodById } = useCustomMoodStore();
  const { colors } = useObsyTheme();
  const { aiFreeMode } = useAiFreeMode();

  const [moodId, setMoodId] = useState<string | null>(null);
  const [moodName, setMoodName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [moodModalVisible, setMoodModalVisible] = useState(false);
  const [includeInInsights, setIncludeInInsights] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setMoodModalVisible(true), 120);
    return () => clearTimeout(timer);
  }, []);

  const handleMoodSelect = (id: string) => {
    const mood = getMoodById(id);
    setMoodId(id);
    setMoodName(mood?.name || MOODS.find((item) => item.id === id)?.label || id);
  };

  const handleSave = async () => {
    if (!moodId || isSaving) return;

    setIsSaving(true);
    try {
      await createJournalEntry(user, moodId, moodName, '', [], includeInInsights && !aiFreeMode);
      router.dismissAll();
      setTimeout(() => router.replace('/(tabs)'), 100);
    } catch (error) {
      console.error('[QuickMood] Save failed:', error);
      setIsSaving(false);
    }
  };

  const canSave = !!moodId && !isSaving;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={28} color="white" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Quick Mood</ThemedText>
        <TouchableOpacity onPress={handleSave} disabled={!canSave} style={styles.headerButton}>
          <ThemedText style={[styles.doneText, !canSave && styles.doneTextDisabled]}>
            {isSaving ? 'Saving...' : 'Done'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setMoodModalVisible(true)}
          style={[styles.moodTrigger, moodId && styles.moodTriggerSelected]}
        >
          {moodId ? (
            <>
              <ThemedText style={styles.moodTriggerText}>{moodName}</ThemedText>
              <Ionicons name="chevron-down" size={14} color="rgba(0,0,0,0.6)" />
            </>
          ) : (
            <>
              <Ionicons name="add" size={16} color="rgba(255,255,255,0.6)" />
              <ThemedText style={styles.moodTriggerPlaceholder}>Select mood</ThemedText>
            </>
          )}
        </TouchableOpacity>

        <View style={[styles.includeRow, { borderColor: colors.cardBorder }, aiFreeMode && styles.includeRowDisabled]}>
          <View style={styles.includeCopy}>
            <ThemedText style={styles.includeLabel}>Include in insights</ThemedText>
            <ThemedText style={styles.includeHint}>
              Keep this on if the mood should count toward insight summaries.
            </ThemedText>
          </View>
          <Switch
            value={includeInInsights && !aiFreeMode}
            disabled={aiFreeMode}
            onValueChange={setIncludeInInsights}
            trackColor={{ false: 'rgba(255,255,255,0.2)', true: Colors.obsy.silver }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <MoodSelectionModal
        visible={moodModalVisible}
        selectedMood={moodId}
        onSelect={handleMoodSelect}
        onClose={() => setMoodModalVisible(false)}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerButton: {
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'white',
  },
  doneText: {
    color: Colors.obsy.silver,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
  },
  doneTextDisabled: {
    opacity: 0.3,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 18,
  },
  moodTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    minWidth: 180,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  moodTriggerSelected: {
    backgroundColor: '#FFFFFF',
  },
  moodTriggerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  moodTriggerPlaceholder: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.58)',
  },
  includeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  includeRowDisabled: {
    opacity: 0.45,
  },
  includeCopy: {
    flex: 1,
    gap: 4,
  },
  includeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  includeHint: {
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.52)',
  },
});
