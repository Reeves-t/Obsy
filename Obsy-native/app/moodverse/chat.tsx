import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    FlatList,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Send } from 'lucide-react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useMoodverseStore, ChatMessage } from '@/lib/moodverseStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { callMoodverseExplain, CaptureContext } from '@/services/moodverseExplainClient';
import { computeGalaxyLayout } from '@/components/moodverse/galaxyLayout';
import { ObsyIcon } from '@/components/moodverse/ObsyIcon';
import type { GalaxyOrb, GalaxyCluster } from '@/components/moodverse/galaxyTypes';
import { format } from 'date-fns';

// ── Eclipse Loader ──────────────────────────────────────────────────────

function EclipseLoader() {
    const [frame, setFrame] = React.useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((f) => (f + 1) % 60);
        }, 50);
        return () => clearInterval(interval);
    }, []);

    const angle = (frame / 60) * Math.PI * 2;
    const orbitRadius = 8;
    const cx = 16 + Math.cos(angle) * orbitRadius;
    const cy = 16 + Math.sin(angle) * orbitRadius;

    return (
        <View style={eclipseStyles.container}>
            <View style={eclipseStyles.disc} />
            <View style={[eclipseStyles.orbiter, { left: cx - 3, top: cy - 3 }]} />
        </View>
    );
}

const eclipseStyles = StyleSheet.create({
    container: { width: 32, height: 32, alignSelf: 'flex-start', marginLeft: 4, marginVertical: 8 },
    disc: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(139, 34, 82, 0.15)', left: 8, top: 8 },
    orbiter: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(139, 34, 82, 0.7)' },
});

// ── Chat Bubble ─────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user';

    return (
        <View style={[bubbleStyles.container, isUser ? bubbleStyles.userContainer : bubbleStyles.assistantContainer]}>
            <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.assistantBubble]}>
                <ThemedText style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.assistantText]}>
                    {message.text}
                </ThemedText>
            </View>
        </View>
    );
}

const bubbleStyles = StyleSheet.create({
    container: { paddingHorizontal: 16, marginVertical: 4 },
    userContainer: { alignItems: 'flex-end' },
    assistantContainer: { alignItems: 'flex-start' },
    bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    userBubble: { backgroundColor: 'rgba(139, 34, 82, 0.22)', borderBottomRightRadius: 4 },
    assistantBubble: { backgroundColor: 'rgba(255, 255, 255, 0.06)', borderBottomLeftRadius: 4 },
    text: { fontSize: 14, lineHeight: 20 },
    userText: { color: 'rgba(255, 255, 255, 0.85)' },
    assistantText: { color: 'rgba(255, 255, 255, 0.7)' },
});

// ── Context builders ────────────────────────────────────────────────────

function fmt(ts: number): string {
    return format(new Date(ts), 'MMM d h:mm a');
}

function fmtShort(ts: number): string {
    return format(new Date(ts), 'MMM d');
}

function computeStreaks(sorted: GalaxyOrb[]): Array<{ mood: string; length: number; startDate: string; endDate: string }> {
    if (sorted.length === 0) return [];
    const streaks: Array<{ mood: string; length: number; startDate: string; endDate: string }> = [];
    let currentMood = sorted[0].moodLabel;
    let streakStart = 0;

    for (let i = 1; i <= sorted.length; i++) {
        const mood = i < sorted.length ? sorted[i].moodLabel : '';
        if (mood !== currentMood) {
            const len = i - streakStart;
            if (len >= 2) {
                streaks.push({
                    mood: currentMood,
                    length: len,
                    startDate: fmtShort(sorted[streakStart].timestamp),
                    endDate: fmtShort(sorted[i - 1].timestamp),
                });
            }
            if (i < sorted.length) {
                currentMood = mood;
                streakStart = i;
            }
        }
    }

    return streaks.sort((a, b) => b.length - a.length).slice(0, 6);
}

function computeMoodverseContext(
    selectedOrbs: GalaxyOrb[],
    allOrbs: GalaxyOrb[],
    clusters: GalaxyCluster[],
    selectionMode: string,
): string {
    const sorted = [...allOrbs].sort((a, b) => a.timestamp - b.timestamp);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const moodCounts: Record<string, number> = {};
    for (const o of allOrbs) moodCounts[o.moodLabel] = (moodCounts[o.moodLabel] || 0) + 1;
    const topMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([mood, count]) => ({ mood, count }));

    const tagCounts: Record<string, number> = {};
    for (const o of allOrbs) for (const t of o.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count }));

    const months = clusters
        .filter((c) => c.orbs.length > 0)
        .map((c) => {
            const cm: Record<string, number> = {};
            for (const o of c.orbs) cm[o.moodLabel] = (cm[o.moodLabel] || 0) + 1;
            return {
                month: monthNames[c.month],
                captures: c.orbs.length,
                topMoods: Object.entries(cm).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([mood, count]) => ({ mood, count })),
            };
        });

    const selectedSorted = [...selectedOrbs].sort((a, b) => a.timestamp - b.timestamp);
    const selected = selectedSorted.map((o) => ({
        date: fmt(o.timestamp),
        mood: o.moodLabel,
        tags: o.tags,
        ...(o.noteFull ? { note: o.noteFull } : {}),
    }));

    const streaks = computeStreaks(sorted);

    const selectedMoods = new Set(selectedOrbs.map((o) => o.moodLabel));
    const transitionCounts: Record<string, Record<string, number>> = {};
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i].moodLabel;
        const next = sorted[i + 1].moodLabel;
        if (!transitionCounts[curr]) transitionCounts[curr] = {};
        transitionCounts[curr][next] = (transitionCounts[curr][next] || 0) + 1;
    }
    const transitions: Array<{ from: string; to: string; count: number }> = [];
    for (const mood of selectedMoods) {
        const t = transitionCounts[mood];
        if (!t) continue;
        for (const [to, count] of Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
            transitions.push({ from: mood, to, count });
        }
    }

    let beforeSelection: Array<{ date: string; mood: string }> = [];
    let afterSelection: Array<{ date: string; mood: string }> = [];
    let sameMoodSameMonth: Array<{ date: string; mood: string }> = [];

    if (selectedSorted.length > 0) {
        const firstTs = selectedSorted[0].timestamp;
        const lastTs = selectedSorted[selectedSorted.length - 1].timestamp;

        beforeSelection = sorted.filter((o) => o.timestamp < firstTs).slice(-5).map((o) => ({ date: fmt(o.timestamp), mood: o.moodLabel }));
        afterSelection = sorted.filter((o) => o.timestamp > lastTs).slice(0, 5).map((o) => ({ date: fmt(o.timestamp), mood: o.moodLabel }));

        const selectedCluster = selectedSorted[0].clusterId;
        const selectedIdSet = new Set(selectedOrbs.map((o) => o.id));
        sameMoodSameMonth = sorted
            .filter((o) => o.clusterId === selectedCluster && selectedMoods.has(o.moodLabel) && !selectedIdSet.has(o.id))
            .slice(0, 8)
            .map((o) => ({ date: fmt(o.timestamp), mood: o.moodLabel }));
    }

    const recency = sorted.slice(-14).map((o) => ({ date: fmtShort(o.timestamp), mood: o.moodLabel }));

    const pack = {
        aggregates: { totalCaptures: allOrbs.length, moodCounts: topMoods, topTags },
        months,
        selected: { mode: selectionMode, captures: selected },
        patterns: { streaks, transitions, beforeSelection, afterSelection, sameMoodSameMonth },
        recency,
    };

    return JSON.stringify(pack);
}

// ── Main Screen ─────────────────────────────────────────────────────────

export default function MoodverseChatScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { captures } = useCaptureStore();

    const {
        chatMessages,
        isAiLoading,
        chatContextOrbIds,
        chatContextMode,
        selectedYear,
        addChatMessage,
        setAiLoading,
        setAiHighlightedOrbIds,
        closeExplain,
    } = useMoodverseStore();

    const [inputText, setInputText] = useState('');
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const hasInitialized = useRef(false);

    const isGeneral = chatContextMode === 'general';

    // Recompute orbs/clusters from captures (same as MoodversePage)
    const { orbs, clusters } = useMemo(() => {
        if (!user?.id || captures.length === 0) return { orbs: [] as GalaxyOrb[], clusters: [] as GalaxyCluster[] };
        return computeGalaxyLayout(captures, user.id, selectedYear);
    }, [captures, user?.id, selectedYear]);

    const selectedOrbs = useMemo(() => {
        if (isGeneral || chatContextOrbIds.length === 0) return [];
        const idSet = new Set(chatContextOrbIds);
        return orbs.filter((o) => idSet.has(o.id));
    }, [chatContextOrbIds, orbs, isGeneral]);

    const captureContexts: CaptureContext[] = useMemo(() => {
        return selectedOrbs.map((orb) => ({
            id: orb.id,
            mood: orb.moodLabel,
            note: orb.noteFull ?? undefined,
            tags: orb.tags,
            date: new Date(orb.timestamp).toISOString(),
            clusterId: orb.clusterId,
        }));
    }, [selectedOrbs]);

    const moodverseContext = useMemo(() => {
        if (isGeneral) {
            // General chat: send full year overview with no specific selection
            return computeMoodverseContext([], orbs, clusters, 'general');
        }
        return computeMoodverseContext(selectedOrbs, orbs, clusters, chatContextMode);
    }, [selectedOrbs, orbs, clusters, chatContextMode, isGeneral]);

    const sendArgsRef = useRef({ captureContexts, chatContextMode, moodverseContext, selectedOrbs, orbs, isGeneral });
    sendArgsRef.current = { captureContexts, chatContextMode, moodverseContext, selectedOrbs, orbs, isGeneral };

    const sendToAI = useCallback(async (history: ChatMessage[]) => {
        const { captureContexts: ctx, chatContextMode: mode, moodverseContext: mvCtx, orbs: all, selectedOrbs: sel, isGeneral: gen } = sendArgsRef.current;
        setAiLoading(true);

        try {
            // For general chat, send a single dummy capture so the edge function doesn't reject
            const captures = gen
                ? [{ id: 'general', mood: 'general', date: new Date().toISOString() }]
                : ctx;

            const result = await callMoodverseExplain(
                captures,
                gen ? 'single' : (mode as 'single' | 'multi' | 'cluster'),
                history,
                mvCtx,
            );

            if (result.ok && result.text) {
                addChatMessage({
                    id: result.requestId || `ai-${Date.now()}`,
                    role: 'assistant',
                    text: result.text,
                });

                if (result.highlightedMoods && result.highlightedMoods.length > 0) {
                    const moodSet = new Set(result.highlightedMoods.map((m) => m.toLowerCase()));
                    const matchedIds = all.filter((o) => moodSet.has(o.moodLabel.toLowerCase())).map((o) => o.id);
                    setAiHighlightedOrbIds(matchedIds.length > 0 ? matchedIds : sel.map((o) => o.id));
                } else {
                    setAiHighlightedOrbIds(sel.map((o) => o.id));
                }
            } else {
                addChatMessage({ id: `err-${Date.now()}`, role: 'assistant', text: "Something went quiet on my end. Try again in a moment." });
            }
        } catch (err) {
            addChatMessage({ id: `err-${Date.now()}`, role: 'assistant', text: "Lost the connection for a second. Try again." });
        } finally {
            setAiLoading(false);
        }
    }, [addChatMessage, setAiLoading, setAiHighlightedOrbIds]);

    // Auto-initialize
    useEffect(() => {
        if (hasInitialized.current || chatMessages.length > 0) return;
        hasInitialized.current = true;
        sendToAI([]);
    }, [sendToAI, chatMessages.length]);

    // Auto-focus input after mount
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 400);
        return () => clearTimeout(timer);
    }, []);

    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text || isAiLoading) return;

        const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };
        addChatMessage(userMsg);
        setInputText('');

        sendToAI([...chatMessages, userMsg]);
    }, [inputText, isAiLoading, chatMessages, addChatMessage, sendToAI]);

    useEffect(() => {
        if (chatMessages.length > 0) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [chatMessages.length]);

    const handleBack = useCallback(() => {
        closeExplain();
        router.back();
    }, [closeExplain, router]);

    const renderItem = useCallback(({ item }: { item: ChatMessage }) => <ChatBubble message={item} />, []);
    const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#e4e4ed" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <View style={styles.iconGlow}>
                        <ObsyIcon size={32} />
                    </View>
                </View>

                <View style={styles.headerRight} />
            </View>

            {/* Subtle glow behind icon */}
            <View style={styles.glowContainer} pointerEvents="none">
                <LinearGradient
                    colors={['rgba(139, 34, 82, 0.12)', 'transparent']}
                    style={styles.glowGradient}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                />
            </View>

            {/* Chat area */}
            <KeyboardAvoidingView
                style={styles.chatArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={insets.top + 56}
            >
                <FlatList
                    ref={flatListRef}
                    data={chatMessages}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    style={styles.messageList}
                    contentContainerStyle={styles.messageListContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    ListFooterComponent={isAiLoading ? <EclipseLoader /> : null}
                    ListEmptyComponent={
                        !isAiLoading ? (
                            <View style={styles.emptyChat}>
                                <ObsyIcon size={56} />
                                <ThemedText style={styles.emptyChatText}>
                                    {isGeneral ? "What's on your mind?" : "Starting conversation..."}
                                </ThemedText>
                            </View>
                        ) : null
                    }
                />

                <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <TextInput
                        ref={inputRef}
                        style={styles.textInput}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={isGeneral ? "What's on your mind?" : "Say something..."}
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        multiline
                        maxLength={1200}
                        editable={!isAiLoading}
                        onSubmitEditing={handleSend}
                        blurOnSubmit={false}
                        returnKeyType="send"
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!inputText.trim() || isAiLoading) && styles.sendBtnDisabled]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || isAiLoading}
                    >
                        <Send
                            size={16}
                            color={inputText.trim() && !isAiLoading ? '#8B2252' : 'rgba(255,255,255,0.15)'}
                        />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#06060a',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        zIndex: 10,
    },
    backBtn: {
        padding: 4,
        width: 40,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    iconGlow: {
        shadowColor: '#8B2252',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 8,
    },
    headerRight: {
        width: 40,
    },
    glowContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 140,
        zIndex: 0,
    },
    glowGradient: {
        flex: 1,
    },
    chatArea: {
        flex: 1,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        paddingTop: 8,
        paddingBottom: 16,
    },
    emptyChat: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        gap: 16,
    },
    emptyChatText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.3)',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    textInput: {
        flex: 1,
        minHeight: 38,
        maxHeight: 100,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        color: '#fff',
        fontSize: 14,
        marginRight: 8,
    },
    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(139, 34, 82, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
});
