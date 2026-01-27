import React from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { useCaptureStore } from '@/lib/captureStore';
import { MOODS } from '@/constants/Moods';
import { format } from 'date-fns';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ImageViewerScreen() {
    const router = useRouter();
    const { captureId } = useLocalSearchParams<{ captureId: string }>();
    const { captures } = useCaptureStore();

    const capture = captures.find(c => c.id === captureId);
    const mood = capture ? MOODS.find(m => m.id === capture.mood) : null;

    if (!capture) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" hidden={true} />
                <Stack.Screen options={{
                    headerShown: false,
                    presentation: 'fullScreenModal',
                    animation: 'fade',
                    gestureEnabled: true
                }} />
                <View style={styles.center}>
                    <ThemedText style={{ color: 'rgba(255,255,255,0.6)' }}>Image not found</ThemedText>
                    <TouchableOpacity onPress={() => router.back()} style={styles.goBackButton}>
                        <ThemedText style={{ color: Colors.obsy.silver }}>Go Back</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" hidden={true} />
            <Stack.Screen options={{
                headerShown: false,
                presentation: 'fullScreenModal',
                animation: 'fade',
                gestureEnabled: true
            }} />

            {/* Full-screen Image */}
            <Image
                source={{ uri: capture.image_url }}
                style={styles.image}
                contentFit="contain"
                transition={200}
            />

            {/* Close Button */}
            <View style={styles.closeButtonContainer}>
                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
                    <BlurView intensity={50} tint="dark" style={styles.closeButton}>
                        <Ionicons name="close" size={22} color="white" />
                    </BlurView>
                </TouchableOpacity>
            </View>

            {/* Bottom Metadata Overlay */}
            <View style={styles.metadataContainer}>
                <BlurView intensity={60} tint="dark" style={styles.metadataBlur}>
                    <View style={styles.metadataContent}>
                        {mood && (
                            <View style={styles.moodPill}>
                                <ThemedText style={styles.moodText}>{mood.label}</ThemedText>
                            </View>
                        )}
                        <ThemedText style={styles.dateText}>
                            {format(new Date(capture.created_at), 'MMMM d, yyyy')}
                        </ThemedText>
                    </View>
                </BlurView>
            </View>
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
        gap: 16,
    },
    goBackButton: {
        padding: 10,
    },
    image: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    },
    closeButtonContainer: {
        position: 'absolute',
        top: 54,
        left: 16,
        zIndex: 10,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    metadataContainer: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        zIndex: 10,
    },
    metadataBlur: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    metadataContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    moodPill: {
        backgroundColor: 'rgba(110, 231, 183, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(110, 231, 183, 0.3)',
    },
    moodText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#6ee7b7',
    },
    dateText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
    },
});

