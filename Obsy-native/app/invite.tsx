import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import { addFriendById, getProfileById } from '@/services/friends';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/Colors';

export default function InviteScreen() {
    const { userId } = useLocalSearchParams<{ userId: string }>();
    const router = useRouter();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [inviterName, setInviterName] = useState<string | null>(null);
    const [inviterAvatar, setInviterAvatar] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadInviter();
    }, [userId]);

    const loadInviter = async () => {
        if (!userId) {
            setError("Invalid invite link.");
            setLoading(false);
            return;
        }

        try {
            const profile = await getProfileById(userId);
            if (!profile) {
                setError("User not found.");
                setLoading(false);
                return;
            }

            setInviterName(profile.full_name || 'Someone');

            // Get avatar URL if exists
            if (profile.avatar_url) {
                const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
                setInviterAvatar(data.publicUrl);
            }
        } catch (err) {
            console.error("Error loading inviter:", err);
            setError("Failed to load invite.");
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async () => {
        if (!userId || !user) {
            Alert.alert("Error", "Please sign in to add friends.");
            return;
        }

        setProcessing(true);
        const result = await addFriendById(userId);
        setProcessing(false);

        if (result.success) {
            Alert.alert("Success!", `${inviterName} has been added as a friend.`, [
                { text: "OK", onPress: () => router.replace('/albums') }
            ]);
        } else {
            Alert.alert("Couldn't Add Friend", result.message);
        }
    };

    const handleDecline = () => {
        router.back();
    };

    if (loading) {
        return (
            <ScreenWrapper hideFloatingBackground>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.obsy.silver} />
                </View>
            </ScreenWrapper>
        );
    }

    if (error) {
        return (
            <ScreenWrapper hideFloatingBackground>
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={64} color="rgba(255,255,255,0.3)" />
                    <ThemedText style={styles.errorText}>{error}</ThemedText>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper hideFloatingBackground>
            <BlurView intensity={60} tint="dark" style={styles.container}>
                <GlassCard style={styles.card}>
                    {/* Avatar */}
                    <View style={styles.avatarContainer}>
                        {inviterAvatar ? (
                            <Image source={{ uri: inviterAvatar }} style={styles.avatar} contentFit="cover" />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <ThemedText style={styles.avatarText}>
                                    {(inviterName || 'S').charAt(0).toUpperCase()}
                                </ThemedText>
                            </View>
                        )}
                    </View>

                    {/* Title */}
                    <ThemedText type="subtitle" style={styles.title}>
                        Add {inviterName}?
                    </ThemedText>
                    <ThemedText style={styles.subtitle}>
                        {inviterName} wants to connect with you on Obsy.
                    </ThemedText>

                    {/* Buttons */}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.acceptButton]}
                            onPress={handleAccept}
                            disabled={processing}
                        >
                            {processing ? (
                                <ActivityIndicator color="#000" size="small" />
                            ) : (
                                <ThemedText style={styles.acceptText}>Yes, Add Friend</ThemedText>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.declineButton]}
                            onPress={handleDecline}
                            disabled={processing}
                        >
                            <ThemedText style={styles.declineText}>No Thanks</ThemedText>
                        </TouchableOpacity>
                    </View>
                </GlassCard>
            </BlurView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        padding: 32,
        alignItems: 'center',
    },
    avatarContainer: {
        marginBottom: 20,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: Colors.obsy.silver,
    },
    avatarPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.obsy.silver,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontWeight: '700',
        color: '#000',
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 28,
        lineHeight: 22,
    },
    buttonRow: {
        width: '100%',
        gap: 12,
    },
    button: {
        paddingVertical: 14,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptButton: {
        backgroundColor: Colors.obsy.silver,
    },
    acceptText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
    declineButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    declineText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
    backButton: {
        marginTop: 16,
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    backButtonText: {
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
});
