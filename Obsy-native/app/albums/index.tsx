import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { SharedCanvas } from '@/components/albums/SharedCanvas';
import { AlbumSidebar, Album } from '@/components/albums/AlbumSidebar';
import { InsightModal } from '@/components/albums/InsightModal';
import { PeoplePanel } from '@/components/albums/PeoplePanel';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { getAlbumDayContext } from '@/lib/albumEngine';
import { generateAlbumInsight } from '@/services/ai';
import { getProfile } from '@/services/profile';
import { Alert } from 'react-native';
import { DEFAULT_AI_TONE_ID } from '@/lib/aiTone';
import { archiveInsightWithResult } from '@/services/archive';
import { usePostAlbumInsight } from '@/hooks/useAlbumInsightPosts';
import { AlbumInsightPostInput, Album as AlbumTypeFromTypes } from '@/types/albums';

// Public album constant
const PUBLIC_ALBUM: Album = {
    id: 'public',
    name: 'Public',
    type: 'public'
};

export default function AlbumsScreen() {
    const router = useRouter();
    const [isGenerating, setIsGenerating] = useState(false);
    const [showInsightModal, setShowInsightModal] = useState(false);
    // Default to Public album
    const [currentAlbum, setCurrentAlbum] = useState<Album | null>(PUBLIC_ALBUM);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Set Public as default album on mount
    useEffect(() => {
        if (!currentAlbum) {
            setCurrentAlbum(PUBLIC_ALBUM);
        }
    }, []);

    const [insightText, setInsightText] = useState("");

    // State for tracking current insight metadata
    const [insightGeneratedAt, setInsightGeneratedAt] = useState<string | null>(null);
    const [insightTone, setInsightTone] = useState<string | null>(null);
    const [sourceInsightId, setSourceInsightId] = useState<string | null>(null);
    const [hasPosted, setHasPosted] = useState(false);

    // Key to trigger SharedCanvas refresh after posting
    const [canvasRefreshKey, setCanvasRefreshKey] = useState(0);

    // People Panel state
    const [showPeoplePanel, setShowPeoplePanel] = useState(false);
    const [creatorId, setCreatorId] = useState<string>('');

    // Hook for posting album insights
    const { postInsight, isPosting } = usePostAlbumInsight();

    // Fetch album creator when album changes
    useEffect(() => {
        const fetchAlbumCreator = async () => {
            if (!currentAlbum || currentAlbum.id === 'public') {
                setCreatorId('');
                return;
            }
            const { data } = await supabase
                .from('albums')
                .select('created_by')
                .eq('id', currentAlbum.id)
                .single();
            if (data) setCreatorId(data.created_by);
        };
        fetchAlbumCreator();
    }, [currentAlbum]);

    const handleGenerateInsight = async () => {
        setIsGenerating(true);

        try {
            // 1. Get current user and album
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            if (!currentAlbum) {
                Alert.alert("No Album Selected", "Please select an album first.");
                setIsGenerating(false);
                return;
            }

            const albumId = currentAlbum.id;

            const today = new Date().toISOString().split('T')[0];

            // 2. Persistence Check: Check if insight exists for today
            const { data: existing } = await supabase
                .from('album_daily_insights')
                .select('id, narrative_text, created_at')
                .eq('album_id', albumId)
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
            const context = await getAlbumDayContext(albumId);
            if (context.length === 0) {
                Alert.alert("Not enough data", "No captures found for today to generate an insight.");
                setIsGenerating(false);
                return;
            }

            // 4. Get User Tone
            const profile = await getProfile();
            const tone = profile?.ai_tone || DEFAULT_AI_TONE_ID;

            // 5. Generate Insight
            const text = await generateAlbumInsight(context, tone);

            // 6. Save Result
            const { data: savedInsight, error: saveError } = await supabase
                .from('album_daily_insights')
                .insert({
                    album_id: albumId,
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
                    albumId: albumId,
                    albumName: currentAlbum.name
                });

                if (archiveResult.error) {
                    console.error("[AlbumsScreen] Archive error:", {
                        albumId: albumId,
                        albumName: currentAlbum.name,
                        error: archiveResult.error,
                    });
                    // Note: We don't show an alert here because archiving is supplementary
                    // The user can still see and interact with the insight
                }
            } catch (archiveError) {
                console.error("[AlbumsScreen] Unexpected archive error:", archiveError);
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

    const handleRefreshInsight = async () => {
        if (!currentAlbum) return;
        setIsRefreshing(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const albumId = currentAlbum.id;
            const today = new Date().toISOString().split('T')[0];

            // Fetch fresh data
            const context = await getAlbumDayContext(albumId);
            if (context.length === 0) {
                Alert.alert("Not enough data", "No captures found for today.");
                setIsRefreshing(false);
                return;
            }

            // Get User Tone
            const profile = await getProfile();
            const tone = profile?.ai_tone || DEFAULT_AI_TONE_ID;

            // Generate new insight
            const text = await generateAlbumInsight(context, tone);

            // Update existing record (upsert) and get the updated row
            const { data: upsertData, error: saveError } = await supabase
                .from('album_daily_insights')
                .upsert({
                    album_id: albumId,
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
            setIsRefreshing(false);
        }
    };

    const handlePostInsightToAlbum = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!currentAlbum || !user || !insightText || hasPosted) return;

        try {
            const input: AlbumInsightPostInput = {
                albumId: currentAlbum.id,
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

    return (
        <ScreenWrapper screenName="albums" hideFloatingBackground edges={['top', 'left', 'right', 'bottom']}>
            <View style={styles.container}>
                {/* Custom Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={28} color="white" />
                </TouchableOpacity>

                {/* Main Shared Canvas */}
                <View style={styles.canvasContainer}>
                    {currentAlbum ? (
                        <>
                            <View style={styles.albumHeader}>
                                <ThemedText type="subtitle" style={styles.albumTitle}>{currentAlbum.name}</ThemedText>
                            </View>
                            <SharedCanvas isGenerating={isGenerating} albumId={currentAlbum.id} refreshKey={canvasRefreshKey} />
                        </>
                    ) : (
                        <View style={styles.placeholderContainer}>
                            <Ionicons name="albums-outline" size={64} color="rgba(255,255,255,0.2)" />
                            <ThemedText style={styles.placeholderText}>Select an album to view memories</ThemedText>
                        </View>
                    )}
                </View>

                {/* Right Action Icons - People Panel Trigger */}
                {currentAlbum && (
                    <TouchableOpacity
                        style={styles.rightActions}
                        onPress={() => setShowPeoplePanel(true)}
                    >
                        <Ionicons name="people-outline" size={30} color="white" />
                    </TouchableOpacity>
                )}

                {/* Sidebar Widget */}
                <AlbumSidebar
                    onSelectAlbum={setCurrentAlbum}
                    selectedAlbumId={currentAlbum?.id}
                />

                {/* Bottom Action Button */}
                {currentAlbum && (
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
                )}

                {/* Insight Modal */}
                <InsightModal
                    visible={showInsightModal}
                    onClose={handleCloseModal}
                    insightText={insightText}
                    onRefresh={handleRefreshInsight}
                    isRefreshing={isRefreshing}
                    onPostToAlbum={!hasPosted ? handlePostInsightToAlbum : undefined}
                    isPosting={isPosting}
                />

                {/* People Panel */}
                {currentAlbum && (
                    <PeoplePanel
                        visible={showPeoplePanel}
                        onClose={() => setShowPeoplePanel(false)}
                        albumId={currentAlbum.id}
                        albumName={currentAlbum.name}
                        creatorId={creatorId}
                    />
                )}
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
        top: 48,
        left: 16,
        zIndex: 1000,
        padding: 8,
    },
    rightActions: {
        position: 'absolute',
        top: 48,
        right: 16,
        zIndex: 1000,
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    canvasContainer: {
        flex: 1,
        position: 'relative',
    },
    bottomContainer: {
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
    albumHeader: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
    },
    albumTitle: {
        fontSize: 24,
        fontWeight: '600',
        color: 'white',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    placeholderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    placeholderText: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.4)',
    },
});
