import React, { useState, useRef, useEffect } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    TextInput,
    Switch,
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
import { getProfile, type Profile } from '@/services/profile';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';

export default function JournalEntryScreen() {
    const router = useRouter();
    const { createJournalEntry } = useCaptureStore();
    const { user } = useAuth();
    const { getMoodById } = useCustomMoodStore();
    const { colors } = useObsyTheme();

    // Ref lets us call .blur() to dismiss keyboard reliably on iOS
    const inputRef = useRef<TextInput>(null);

    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [moodModalVisible, setMoodModalVisible] = useState(false);
    const [includeInInsights, setIncludeInInsights] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);
    const { aiFreeMode } = useAiFreeMode();

    useEffect(() => {
        getProfile().then(setProfile).catch(() => setProfile(null));
    }, []);

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        setMoodId(id);
        setMoodName(mood?.name || MOODS.find(m => m.id === id)?.label || id);
    };

    const handleSave = async () => {
        if (!moodId || isSaving) return;
        setIsSaving(true);
        try {
            await createJournalEntry(user, moodId, moodName, note, [], includeInInsights && !aiFreeMode);
            router.dismissAll();
            setTimeout(() => router.replace('/(tabs)'), 100);
        } catch (err) {
            console.error('[JournalEntry] Save failed:', err);
            setIsSaving(false);
        }
    };

    const handleOpenMoodModal = () => {
        // Blur (remove keyboard focus) before showing the modal.
        // .blur() is synchronous and reliably dismisses the iOS keyboard,
        // unlike Keyboard.dismiss() which can be ignored when a TextInput is active.
        inputRef.current?.blur();
        setTimeout(() => setMoodModalVisible(true), 80);
    };

    const canSave = !!moodId && !isSaving;

    return (
        <ScreenWrapper>
            {/*
             * KeyboardAvoidingView keeps the mood bar above the keyboard.
             * autoFocus is false on LinedJournalInput so the keyboard
             * does NOT open automatically on page load.
             */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={0}
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

                {/* Lined journal — ref forwarded so we can blur it */}
                <LinedJournalInput
                    ref={inputRef}
                    value={note}
                    onChangeText={setNote}
                    autoFocus={false}
                />

                {/* Mood bar — sticks above keyboard via KeyboardAvoidingView */}
                <View style={[styles.moodBar, { borderTopColor: colors.cardBorder }]}>
                    <View style={styles.moodBarTop}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={handleOpenMoodModal}
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
                    <View style={[styles.includeRow, aiFreeMode && styles.includeRowDisabled]}>
                        <ThemedText style={styles.includeLabel}>Include in insights</ThemedText>
                        <Switch
                            value={includeInInsights && !aiFreeMode}
                            disabled={aiFreeMode}
                            onValueChange={setIncludeInInsights}
                            trackColor={{ false: 'rgba(255,255,255,0.2)', true: Colors.obsy.silver }}
                            thumbColor="#fff"
                        />
                    </View>
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
    flex: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 12,
    },
    headerButton: { minWidth: 60 },
    headerTitle: { fontSize: 17, fontWeight: '600', color: 'white' },
    doneText: {
        color: Colors.obsy.silver,
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'right',
    },
    doneTextDisabled: { opacity: 0.3 },
    moodBar: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    moodBarTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    includeRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    includeRowDisabled: {
        opacity: 0.45,
    },
    includeLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
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
    moodTriggerSelected: { backgroundColor: '#FFFFFF' },
    moodTriggerText: { fontSize: 14, fontWeight: '600', color: '#000000' },
    moodTriggerPlaceholder: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
});
