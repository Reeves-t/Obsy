import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { SharedCanvas } from '@/components/albums/SharedCanvas';
import { AlbumSidebar } from '@/components/albums/AlbumSidebar';
import { InsightModal } from '@/components/albums/InsightModal';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { getAlbumDayContext } from '@/lib/albumEngine';
import { generateAlbumInsightSecure, resolveTonePrompt } from '@/services/secureAI';
import { getProfile } from '@/services/profile';
import { DEFAULT_AI_TONE_ID } from '@/lib/aiTone';
import { useAlbumToneStore } from '@/lib/albumToneStore';
import { archiveInsightWithResult } from '@/services/archive';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { useAuth } from '@/contexts/AuthContext';
import { usePostAlbumInsight } from '@/hooks/useAlbumInsightPosts';
import { AlbumInsightPostInput } from '@/types/albums';
import { checkAlbumMembership } from '@/services/albums';
import { PeoplePanel } from '@/components/albums/PeoplePanel';
import { useAlbumRename } from '@/lib/useAlbumRename';

// Check if this is the Public album (mock album)
const isPublicAlbum = (albumId: string | undefined) => albumId === 'public';

export default function AlbumDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);
    const [showInsightModal, setShowInsightModal] = useState(false);
    const [insightText, setInsightText] = useState("");
    const [albumName, setAlbumName] = useState("");
    const [creatorId, setCreatorId] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMember, setIsMember] = useState(true);
    const [showPeoplePanel, setShowPeoplePanel] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isRefreshingInsight, setIsRefreshingInsight] = useState(false);

    // State for tracking current insight metadata
    const [insightGeneratedAt, setInsightGeneratedAt] = useState<string | null>(null);
    const [insightTone, setInsightTone] = useState<string | null>(null);
    const [sourceInsightId, setSourceInsightId] = useState<string | null>(null);
    const [hasPosted, setHasPosted] = useState(false);

    // Key to trigger SharedCanvas refresh after posting
    const [canvasRefreshKey, setCanvasRefreshKey] = useState(0);

    const { getDisplayName } = useAlbumRename();
    const currentDisplayName = id ? getDisplayName(id, albumName) : albumName;
    const { getAlbumTone, load: loadAlbumTones, loaded: albumTonesLoaded } = useAlbumToneStore();

    useEffect(() => {
        if (!albumTonesLoaded) loadAlbumTones();
    }, [albumTonesLoaded]);

    // Hook for posting album insights
    const { postInsight, isPosting } = usePostAlbumInsight();

    const fetchAlbumDetails = useCallback(async () => {
        if (!id) return;

        setError(null);

        // Handle Public album (mock album) - no database fetch needed
        if (isPublicAlbum(id)) {
            setAlbumName('Public');
            setIsMember(true);
            setIsLoading(false);
            return;
        }

        try {
            // Fetch album details
            const { data, error: albumError } = await supabase
                .from('albums')
                .select('name, created_by')
                .eq('id', id)
                .single();

            if (albumError) {
                if (albumError.code === 'PGRST116') {
                    // No rows returned - album doesn't exist or user lacks access
                    setError('Album not found or you don\'t have access.');
                    setIsMember(false);
                } else {
                    console.error('Error fetching album details:', albumError);
                    setError('Failed to load album. Please try again.');
                }
                return;
            }

            if (data) {
                setAlbumName(data.name);
                setCreatorId(data.created_by);
            }

            // Verify user is a member of this album
            if (user) {
                const { data: memberData, error: memberError } = await supabase
                    .from('album_members')
                    .select('id')
                    .eq('album_id', id)
                    .eq('user_id', user.id)
                    .single();

                if (memberError && memberError.code !== 'PGRST116') {
                    console.error('Error verifying album membership:', memberError);
                }

                const isCreator = data?.created_by === user.id;
                const isMemberOfAlbum = !!memberData;

                if (!isCreator && !isMemberOfAlbum) {
                    setError('You are not a member of this album.');
                    setIsMember(false);
                } else {
                    setIsMember(true);
                }
            }
        } catch (err) {
            console.error('Unexpected error fetching album details:', err);
            setError('An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, [id, user]);

    useEffect(() => {
        fetchAlbumDetails();
    }, [fetchAlbumDetails]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchAlbumDetails();
        setRefreshing(false);
    }, [fetchAlbumDetails]);

    const handleGenerateInsight = async () => {
        if (!id) return;

        // Public album doesn't support insight generation
        if (isPublicAlbum(id)) {
            Alert.alert('Not Available', 'Insight generation is not available for the Public album.');
            return;
        }

        setIsGenerating(true);

        try {
            // 1. Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const today = new Date().toISOString().split('T')[0];

            // 2. Persistence Check
            const { data: existing } = await supabase
                .from('album_daily_insights')
                .select('id, narrative_text, created_at')
                .eq('album_id', id)
                .eq('user_id', user.id)
                .eq('insight_date', today)
                .single();

            if (existing) {
                setInsightText(existing.narrative_text);
                setInsightGeneratedAt(existing.created_at);
                setSourceInsightId(existing.id);
                setHasPosted(false);
                setIsGenerating(false);
                setShowInsightModal(true);
                return;
            }

            // 3. Fetch Data
            const context = await getAlbumDayContext(id);
            if (context.length === 0) {
                Alert.alert("Not enough data", "No captures found for today to generate an insight.");
                setIsGenerating(false);
                return;
            }

            // 4. Get Album Tone (separate from user's personal AI tone)
            const albumTone = id ? getAlbumTone(id) : { toneId: DEFAULT_AI_TONE_ID };
            const { resolvedTone, resolvedPrompt } = await resolveTonePrompt(
                albumTone.toneId,
                albumTone.customToneId
            );

            // 5. Generate Insight via secure Edge Function
            let text: string;
            const tone = resolvedTone;
            try {
                text = await generateAlbumInsightSecure(
                    context,
                    resolvedTone,
                    albumTone.customToneId ? resolvedPrompt : undefined
                );
            } catch (error: any) {
                console.error("Error generating insight:", error);
                if (error.message?.includes("Rate limit")) {
                    Alert.alert("Rate Limit", "You've reached your AI insight limit. Upgrade to Vanguard for unlimited insights.");
                } else if (error.message?.includes("Authentication required")) {
                    Alert.alert("Authentication Error", "Please sign in again to generate insights.");
                } else {
                    Alert.alert("Error", "Failed to generate insight. Please try again.");
                }
                setIsGenerating(false);
                return;
            }

            // 6. Save Result
            const { data: savedInsight, error: saveError } = await supabase
                .from('album_daily_insights')
                .insert({
                    album_id: id,
                    user_id: user.id,
                    insight_date: today,
                    narrative_text: text
                })
                .select('id, created_at')
                .single();

            if (saveError) {
                console.error("Failed to save insight:", saveError);
            }

            // ARCHIVE: Save to permanent archive (non-blocking, insight modal opens regardless)
            try {
                const archiveResult = await archiveInsightWithResult({
                    userId: user.id,
                    type: 'album',
                    insightText: text,
                    relatedCaptureIds: context.map(c => c.id),
                    date: new Date(),
                    tone: tone,
                    albumId: id,
                    albumName: albumName
                });

                if (archiveResult.error) {
                    console.error("[AlbumDetail] Archive error:", {
                        albumId: id,
                        albumName: albumName,
                        error: archiveResult.error,
                    });
                    // Note: We don't show an alert here because archiving is supplementary
                    // The user can still see and interact with the insight
                }
            } catch (archiveError) {
                console.error("[AlbumDetail] Unexpected archive error:", archiveError);
            }

            // Store insight metadata for posting
            const generatedAt = savedInsight?.created_at || new Date().toISOString();
            setInsightText(text);
            setInsightGeneratedAt(generatedAt);
            setInsightTone(tone);
            setSourceInsightId(savedInsight?.id || null);
            setHasPosted(false);

            // Wait for animation to complete (1s) + a little delay
            setTimeout(() => {
                setShowInsightModal(true);
                setIsGenerating(false);
            }, 1200);

        } catch (error) {
            console.error("Error generating album insight:", error);
            Alert.alert("Error", "Failed to generate insight.");
            setIsGenerating(false);
        }
    };

    const handleCloseModal = () => {
        setShowInsightModal(false);
        setIsGenerating(false);
    };

    const handlePostInsightToAlbum = async () => {
        if (!id || !user || !insightText || hasPosted) return;

        try {
            // Verify membership before posting (provides better UX feedback than RLS alone)
            const isMemberOfAlbum = await checkAlbumMembership(id, user.id);
            if (!isMemberOfAlbum) {
                Alert.alert('Access Denied', 'Only album members can post insights to this album.');
                return;
            }

            const input: AlbumInsightPostInput = {
                albumId: id,
                authorId: user.id,
                insightText: insightText,
                tone: insightTone,
                insightType: 'album',
                sourceInsightId: sourceInsightId,
                generatedAt: insightGeneratedAt || new Date().toISOString(),
            };

            await postInsight(input);
            setHasPosted(true);
            // Trigger SharedCanvas to refresh and show the new thought cloud
            setCanvasRefreshKey(prev => prev + 1);
            Alert.alert('Posted!', 'Your insight has been shared with the album.');
        } catch (error) {
            console.error('Error posting insight to album:', error);
            Alert.alert('Error', 'Failed to post insight to album.');
        }
    };

    const handleRefreshInsight = async () => {
        if (!id) return;
        setIsRefreshingInsight(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const today = new Date().toISOString().split('T')[0];

            // Fetch fresh data
            const context = await getAlbumDayContext(id);
            if (context.length === 0) {
                Alert.alert("Not enough data", "No captures found for today.");
                setIsRefreshingInsight(false);
                return;
            }

            // Get Album Tone (separate from user's personal AI tone)
            const albumTone = id ? getAlbumTone(id) : { toneId: DEFAULT_AI_TONE_ID };
            const { resolvedTone, resolvedPrompt } = await resolveTonePrompt(
                albumTone.toneId,
                albumTone.customToneId
            );
            const tone = resolvedTone;

            // Generate new insight via secure Edge Function
            let text: string;
            try {
                text = await generateAlbumInsightSecure(
                    context,
                    resolvedTone,
                    albumTone.customToneId ? resolvedPrompt : undefined
                );
            } catch (error: any) {
                console.error("Error generating insight:", error);
                if (error.message?.includes("Rate limit")) {
                    Alert.alert("Rate Limit", "You've reached your AI insight limit. Upgrade to Vanguard for unlimited insights.");
                } else if (error.message?.includes("Authentication required")) {
                    Alert.alert("Authentication Error", "Please sign in again to generate insights.");
                } else {
                    Alert.alert("Error", "Failed to generate insight. Please try again.");
                }
                setIsRefreshingInsight(false);
                return;
            }

            // Update existing record (upsert) and get the updated row
            const { data: upsertData, error: saveError } = await supabase
                .from('album_daily_insights')
                .upsert({
                    album_id: id,
                    user_id: user.id,
                    insight_date: today,
                    narrative_text: text
                }, { onConflict: 'album_id,user_id,insight_date' })
                .select('id, created_at')
                .single();

            if (saveError) {
                console.error("Failed to save refreshed insight:", saveError);
            }

            // Update insight text and metadata for posting
            setInsightText(text);
            setInsightTone(tone);
            setInsightGeneratedAt(new Date().toISOString());
            if (upsertData) {
                setSourceInsightId(upsertData.id);
            }
            // Reset hasPosted so user can post the refreshed insight
            setHasPosted(false);
        } catch (error) {
            console.error("Error refreshing insight:", error);
            Alert.alert("Error", "Failed to refresh insight.");
        } finally {
            setIsRefreshingInsight(false);
        }
    };

    const handleCapture = () => {
        // Public album doesn't support capturing
        if (isPublicAlbum(id)) {
            Alert.alert('Not Available', 'Capturing is not available for the Public album.');
            return;
        }
        router.push({ pathname: '/capture', params: { albumId: id } });
    };

    // Loading state
    if (isLoading) {
        return (
            <ScreenWrapper hideFloatingBackground edges={['top', 'left', 'right', 'bottom']}>
                <View style={styles.container}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="chevron-back" size={28} color="white" />
                    </TouchableOpacity>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.obsy.silver} />
                        <ThemedText style={styles.loadingText}>Loading album...</ThemedText>
                    </View>
                </View>
            </ScreenWrapper>
        );
    }

    // Error state
    if (error || !isMember) {
        return (
            <ScreenWrapper hideFloatingBackground edges={['top', 'left', 'right', 'bottom']}>
                <View style={styles.container}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="chevron-back" size={28} color="white" />
                    </TouchableOpacity>
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.5)" />
                        <ThemedText style={styles.errorText}>
                            {error || 'Unable to access this album.'}
                        </ThemedText>
                        <TouchableOpacity style={styles.retryButton} onPress={fetchAlbumDetails}>
                            <ThemedText style={styles.retryText}>Try Again</ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper screenName="albums" hideFloatingBackground edges={['top', 'left', 'right', 'bottom']}>
            <View style={styles.container}>
                {/* Main Shared Canvas */}
                <View style={styles.canvasContainer}>
                    <SharedCanvas isGenerating={isGenerating} albumId={id} refreshKey={canvasRefreshKey} />
                </View>

                {/* Camera Ring */}
                <View style={styles.cameraContainer}>
                    <View style={{ transform: [{ scale: 0.6 }] }}>
                        <PulsingCameraTrigger onPress={handleCapture} />
                    </View>
                </View>

                {/* Sidebar Widget */}
                <AlbumSidebar />

                {/* Bottom Action Button */}
                <View style={styles.bottomContainer}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleGenerateInsight}
                        disabled={isGenerating}
                    >
                        <LinearGradient
                            colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)']}
                            style={styles.generateButton}
                        >
                            <ThemedText style={styles.buttonText}>
                                {isGenerating ? "Generating..." : "Generate Album Insight"}
                            </ThemedText>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* Custom Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={28} color="white" />
                </TouchableOpacity>

                {/* Album Name Header */}
                <View style={styles.headerContainer}>
                    <ThemedText type="subtitle" style={styles.headerTitle}>
                        {currentDisplayName || 'Loading...'}
                    </ThemedText>
                </View>

                {/* Right Action Icons - Using a more reliable icon name */}
                <View style={styles.rightActions}>
                    <TouchableOpacity
                        style={styles.actionIcon}
                        onPress={() => setShowPeoplePanel(true)}
                    >
                        <Ionicons name="people-outline" size={30} color="white" />
                    </TouchableOpacity>
                </View>

                {/* People Panel Bottom Sheet */}
                <PeoplePanel
                    visible={showPeoplePanel}
                    onClose={() => setShowPeoplePanel(false)}
                    albumId={id || ''}
                    albumName={albumName}
                    creatorId={creatorId}
                />

                {/* Insight Modal */}
                <InsightModal
                    visible={showInsightModal}
                    onClose={handleCloseModal}
                    insightText={insightText}
                    onRefresh={handleRefreshInsight}
                    isRefreshing={isRefreshingInsight}
                    onPostToAlbum={handlePostInsightToAlbum}
                    isPosting={isPosting}
                />
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backButton: {
        position: 'absolute',
        top: 48, // Increased from 16 to avoid notch/island
        left: 16,
        zIndex: 1000,
        padding: 8,
    },
    headerContainer: {
        position: 'absolute',
        top: 56, // Adjusted to match vertical center of back/person icons
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 900,
    },
    headerTitle: {
        fontFamily: 'Inter_600SemiBold',
        color: 'rgba(255,255,255,0.8)',
        fontSize: 18,
    },
    rightActions: {
        position: 'absolute',
        top: 48, // Match backButton top
        right: 16,
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    actionIcon: {
        padding: 8,
    },
    canvasContainer: {
        flex: 1,
        position: 'relative',
    },
    cameraContainer: {
        position: 'absolute',
        bottom: 100,
        right: 20,
        zIndex: 60,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 40,
        alignItems: 'center',
        zIndex: 50,
    },
    generateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.obsy.silver,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 40,
    },
    errorText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 8,
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    retryText: {
        color: Colors.obsy.silver,
        fontSize: 14,
        fontWeight: '600',
    },
});
