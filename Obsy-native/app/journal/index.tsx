import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { MoodSelectionModal } from '@/components/capture/MoodSelectionModal';
import { LinedJournalInput } from '@/components/capture/LinedJournalInput';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomMoodStore } from '@/lib/customMoodStore';
import { MOODS } from '@/constants/Moods';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';

export default function JournalEntryScreen() {
    const router = useRouter();
    const { createJournalEntry } = useCaptureStore();
    const { user } = useAuth();
    const { getMoodById } = useCustomMoodStore();
    const { colors } = useObsyTheme();

    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [moodModalVisible, setMoodModalVisible] = useState(false);

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        setMoodId(id);
        setMoodName(mood?.name || MOODS.find(m => m.id === id)?.label || id);
        // onClose is already called by MoodSelectionModal — don't call setMoodModalVisible here
    };

    const handleSave = async () => {
        if (!moodId || isSaving) return;
        setIsSaving(true);
        try {
            await createJournalEntry(user, moodId, moodName, note);
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (err) {
            console.error('[JournalEntry] Save failed:', err);
            setIsSaving(false);
        }
    };

    const canSave = !!moodId && !isSaving;

    return (
        <ScreenWrapper>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
                        <Ionicons name="chevron-back" size={28} color="white" />
                    </TouchableOpacity>
                    <ThemedText style={styles.headerTitle}>Journal</ThemedText>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={!canSave}
                        style={styles.headerButton}
                    >
                        <ThemedText style={[styles.doneText, !canSave && styles.doneTextDisabled]}>
                            {isSaving ? 'Saving…' : 'Done'}
                        </ThemedText>
                    </TouchableOpacity>
                </View>

                {/* Journal input — fills all available space */}
                <LinedJournalInput value={note} onChangeText={setNote} />

                {/* Mood selector bar — sits above keyboard */}
                <View style={[styles.moodBar, { borderTopColor: colors.cardBorder }]}>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                            Keyboard.dismiss();
                            setTimeout(() => setMoodModalVisible(true), 300);
                        }}
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
                                <ThemedText style={styles.moodTriggerPlaceholder}>How are you feeling?</ThemedText>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

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
    flex: {
        flex: 1,
    },
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
    // Mood bar — sticks above keyboard
    moodBar: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    moodTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    moodTriggerSelected: {
        backgroundColor: '#FFFFFF',
    },
    moodTriggerText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000000',
    },
    moodTriggerPlaceholder: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.55)',
    },
});
