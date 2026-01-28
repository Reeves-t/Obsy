import React, { useState } from 'react';
import { StyleSheet, View, Image, TouchableOpacity, Modal } from 'react-native';
import { GlassCard } from '@/components/ui/GlassCard';
import { ThemedText } from '@/components/ui/ThemedText';
import { Capture } from '@/lib/captureStore';
import { MOODS } from '@/constants/Moods';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface TodayCaptureCardProps {
    capture: Capture;
    onPress: () => void;
}

export function TodayCaptureCard({ capture, onPress }: TodayCaptureCardProps) {
    const { colors } = useObsyTheme();
    const mood = MOODS.find(m => m.id === capture.mood);
    const [showNote, setShowNote] = useState(false);

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={{ width: '100%' }}>
            <View style={styles.card}>
                <Image source={{ uri: capture.image_url }} style={styles.image} />

                <View style={styles.overlay}>
                    {mood && (
                        <View style={styles.moodTag}>
                            <ThemedText style={[styles.moodText, { color: colors.text }]}>{mood.label}</ThemedText>
                        </View>
                    )}

                    {capture.obsy_note && (
                        <>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={styles.noteContainer}
                                onPress={() => setShowNote(true)}
                            >
                                <ThemedText style={[styles.noteText, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
                                    {capture.obsy_note}
                                </ThemedText>
                            </TouchableOpacity>

                            <Modal
                                transparent
                                visible={showNote}
                                animationType="fade"
                                onRequestClose={() => setShowNote(false)}
                            >
                                <View style={styles.modalBackdrop}>
                                    <GlassCard style={styles.modalCard}>
                                        <ThemedText type="subtitle" style={styles.modalTitle}>Obsy Note</ThemedText>
                                        <ThemedText style={[styles.modalBody, { color: colors.text }]}>
                                            {capture.obsy_note}
                                        </ThemedText>
                                        <TouchableOpacity
                                            style={styles.closeButton}
                                            onPress={() => setShowNote(false)}
                                            activeOpacity={0.8}
                                        >
                                            <ThemedText style={styles.closeButtonText}>Close</ThemedText>
                                        </TouchableOpacity>
                                    </GlassCard>
                                </View>
                            </Modal>
                        </>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 24,
        overflow: 'hidden',
        aspectRatio: 3 / 4,
        width: '100%',
    },
    image: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingTop: 40,
        justifyContent: 'flex-end',
        gap: 12,
    },
    moodTag: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    moodText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'white',
    },
    noteContainer: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    noteText: {
        fontSize: 13,
        lineHeight: 18,
        color: 'rgba(255,255,255,0.9)',
        fontStyle: 'italic',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalCard: {
        width: '100%',
    },
    modalTitle: {
        color: Colors.obsy.silver,
        marginBottom: 12,
    },
    modalBody: {
        color: 'rgba(255,255,255,0.92)',
        fontSize: 16,
        lineHeight: 22,
        marginBottom: 20,
    },
    closeButton: {
        alignSelf: 'flex-end',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    closeButtonText: {
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
});
