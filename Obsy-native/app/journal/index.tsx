import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
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

type Step = 'mood' | 'journal';

export default function JournalEntryScreen() {
    const router = useRouter();
    const { createJournalEntry } = useCaptureStore();
    const { user } = useAuth();
    const { getMoodById } = useCustomMoodStore();

    const [step, setStep] = useState<Step>('mood');
    const [moodId, setMoodId] = useState<string | null>(null);
    const [moodName, setMoodName] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleMoodSelect = (id: string) => {
        const mood = getMoodById(id);
        const name = mood?.name || MOODS.find(m => m.id === id)?.label || id;
        setMoodId(id);
        setMoodName(name);
        setStep('journal');
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

    const handleBack = () => {
        if (step === 'journal') {
            setStep('mood');
        } else {
            router.back();
        }
    };

    return (
        <ScreenWrapper>
            {step === 'journal' && (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.flex}
                >
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
                            <Ionicons name="chevron-back" size={28} color="white" />
                        </TouchableOpacity>
                        <ThemedText style={styles.moodLabel}>{moodName}</ThemedText>
                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={isSaving}
                            style={styles.headerButton}
                        >
                            <ThemedText style={[styles.doneText, isSaving && styles.doneTextDisabled]}>
                                {isSaving ? 'Saving…' : 'Done'}
                            </ThemedText>
                        </TouchableOpacity>
                    </View>

                    <LinedJournalInput
                        value={note}
                        onChangeText={setNote}
                    />
                </KeyboardAvoidingView>
            )}

            {/* Mood picker — shown as step 1 and as a re-pick overlay */}
            <MoodSelectionModal
                visible={step === 'mood'}
                selectedMood={moodId}
                onSelect={handleMoodSelect}
                onClose={() => router.back()}
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
        paddingBottom: 16,
    },
    headerButton: {
        minWidth: 60,
    },
    moodLabel: {
        fontSize: 18,
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
        opacity: 0.4,
    },
});
