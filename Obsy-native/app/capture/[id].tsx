import React, { useState } from 'react';
import { StyleSheet, View, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useCaptureStore } from '@/lib/captureStore';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useMoodResolver } from '@/hooks/useMoodResolver';

const { width } = Dimensions.get('window');

export default function CaptureDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { captures, deleteCapture } = useCaptureStore();
    const { getMoodDisplay } = useMoodResolver();
    const [isDeleting, setIsDeleting] = useState(false);

    const capture = captures.find(c => c.id === id);

    if (!capture) {
        return (
            <View style={styles.container}>
                <View style={styles.center}>
                    <ThemedText>Capture not found</ThemedText>
                    <TouchableOpacity onPress={() => router.back()} style={styles.goBackButton}>
                        <ThemedText style={{ color: Colors.obsy.silver }}>Go Back</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const moodDisplay = getMoodDisplay(capture.mood_id, capture.mood_name_snapshot);

    const handleDelete = () => {
        Alert.alert(
            "Delete Capture",
            "Are you sure you want to delete this memory? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await deleteCapture(capture.id);
                            router.back();
                        } catch (error) {
                            console.error("Failed to delete:", error);
                            setIsDeleting(false);
                            Alert.alert("Error", "Failed to delete capture.");
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Image Section - Square with overlay */}
                <View style={styles.imageSection}>
                    <Image source={{ uri: capture.image_url }} style={styles.image} />

                    {/* Gradient overlay */}
                    <LinearGradient
                        colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.6)']}
                        style={styles.imageGradient}
                        pointerEvents="none"
                    />

                    {/* Header buttons - absolute positioned on image */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                            <BlurView intensity={40} tint="dark" style={styles.blurButton}>
                                <Ionicons name="chevron-back" size={24} color="white" />
                            </BlurView>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDelete} style={styles.iconButton} disabled={isDeleting}>
                            <BlurView intensity={40} tint="dark" style={styles.blurButton}>
                                {isDeleting ? (
                                    <ActivityIndicator size="small" color="#ff4444" />
                                ) : (
                                    <Ionicons name="trash-outline" size={20} color="#ff4444" />
                                )}
                            </BlurView>
                        </TouchableOpacity>
                    </View>

                    {/* Bottom overlay info - time and mood */}
                    <View style={styles.imageOverlayInfo}>
                        <BlurView intensity={40} tint="dark" style={styles.timePill}>
                            <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.timeText}>
                                {format(new Date(capture.created_at), 'h:mm a')}
                            </ThemedText>
                        </BlurView>

                        {moodDisplay && (
                            <View style={[styles.moodPill, { backgroundColor: `${moodDisplay.color}33`, borderColor: `${moodDisplay.color}66` }]}>
                                <Ionicons name="pricetag-outline" size={14} color={moodDisplay.color} />
                                <ThemedText style={[styles.moodText, { color: moodDisplay.color }]}>{moodDisplay.name}</ThemedText>
                            </View>
                        )}
                    </View>
                </View>

                {/* Details Section */}
                <View style={styles.detailsSection}>
                    {/* AI Caption Section */}
                    {capture.obsy_note && (
                        <View style={styles.captionSection}>
                            <ThemedText style={styles.sectionLabel}>OBSY NOTE</ThemedText>
                            <ThemedText style={styles.captionText}>"{capture.obsy_note}"</ThemedText>
                        </View>
                    )}

                    {/* Journal Section */}
                    <View style={styles.journalSection}>
                        <ThemedText style={styles.sectionLabel}>JOURNAL</ThemedText>
                        <View style={styles.journalBox}>
                            <ThemedText style={styles.journalText}>
                                {capture.note || 'No journal entry for this moment...'}
                            </ThemedText>
                        </View>
                    </View>

                    {/* Captured date footer */}
                    <View style={styles.footer}>
                        <ThemedText style={styles.footerText}>
                            Captured on {format(new Date(capture.created_at), 'MMMM d, yyyy')}
                        </ThemedText>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    goBackButton: {
        padding: 10,
    },
    scrollContent: {
        flexGrow: 1,
    },
    imageSection: {
        width: '100%',
        aspectRatio: 3 / 4, // BeReal-style 3:4 aspect ratio
        backgroundColor: '#18181b',
        position: 'relative',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    image: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    imageGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    header: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    iconButton: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    blurButton: {
        padding: 10,
        borderRadius: 20,
        overflow: 'hidden',
    },
    imageOverlayInfo: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: 16,
    },
    timePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    timeText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.9)',
    },
    moodPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
    },
    moodText: {
        fontSize: 12,
        fontWeight: '500',
    },
    detailsSection: {
        padding: 24,
        gap: 32,
    },
    captionSection: {
        gap: 8,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
    },
    captionText: {
        fontSize: 14,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.7)',
        fontStyle: 'italic',
    },
    journalSection: {
        gap: 12,
    },
    journalBox: {
        backgroundColor: 'rgba(39, 39, 42, 0.5)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        padding: 16,
    },
    journalText: {
        fontSize: 15,
        lineHeight: 24,
        color: 'rgba(255,255,255,0.8)',
    },
    footer: {
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 40,
    },
    footerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
    },
});
