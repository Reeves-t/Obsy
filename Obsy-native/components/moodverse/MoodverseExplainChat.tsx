import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { ThemedText } from '@/components/ui/ThemedText';
import { Send } from 'lucide-react-native';
import { useMoodverseStore, ChatMessage } from '@/lib/moodverseStore';
import { callMoodverseExplain, CaptureContext } from '@/services/moodverseExplainClient';
import type { GalaxyOrb, GalaxyCluster } from './galaxyTypes';
import { format } from 'date-fns';

interface MoodverseExplainChatProps {
    selectedOrbs: GalaxyOrb[];
    allOrbs: GalaxyOrb[];
    clusters: GalaxyCluster[];
    selectionMode: 'single' | 'multi' | 'cluster';
}

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
            <View
                style={[
                    eclipseStyles.orbiter,
                    { left: cx - 3, top: cy - 3 },
                ]}
            />
        </View>
    );
}

const eclipseStyles = StyleSheet.create({
    container: {
        width: 32,
        height: 32,
        alignSelf: 'flex-start',
        marginLeft: 4,
        marginVertical: 8,
    },
    disc: {
        position: 'absolute',
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(139, 34, 82, 0.15)',
        left: 8,
        top: 8,
    },
    orbiter: {
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(139, 34, 82, 0.7)',
    },
});

// ── Chat Bubble ─────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user';

    return (
        <View
            style={[
                bubbleStyles.container,
                isUser ? bubbleStyles.userContainer : bubbleStyles.assistantContainer,
            ]}
        >
            <View
                style={[
                    bubbleStyles.bubble,
                    isUser ? bubbleStyles.userBubble : bubbleStyles.assistantBubble,
                ]}
            >
                <ThemedText
                    style={[
                        bubbleStyles.text,
                        isUser ? bubbleStyles.userText : bubbleStyles.assistantText,
                    ]}
                >
                    {message.text}
                </ThemedText>
            </View>
        </View>
    );
}

const bubbleStyles = StyleSheet.create({
    container: {
        paddingHorizontal: 4,
        marginVertical: 4,
    },
    userContainer: {
        alignItems: 'flex-end',
    },
    assistantContainer: {
        alignItems: 'flex-start',
    },
    bubble: {
        maxWidth: '85%',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    userBubble: {
        backgroundColor: 'rgba(139, 34, 82, 0.22)',
        borderBottomRightRadius: 4,
    },
    assistantBubble: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderBottomLeftRadius: 4,
    },
    text: {
        fontSize: 14,
        lineHeight: 20,
    },
    userText: {
        color: 'rgba(255, 255, 255, 0.85)',
    },
    assistantText: {
        color: 'rgba(255, 255, 255, 0.7)',
    },
});

// ── Context pack builder (structured JSON sent to AI) ───────────────────

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

    // ── Aggregates ──────────────────────────────────────────────────────
    const moodCounts: Record<string, number> = {};
    for (const o of allOrbs) {
        moodCounts[o.moodLabel] = (moodCounts[o.moodLabel] || 0) + 1;
    }
    const topMoods = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([mood, count]) => ({ mood, count }));

    const tagCounts: Record<string, number> = {};
    for (const o of allOrbs) {
        for (const t of o.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

    // ── Monthly breakdown ───────────────────────────────────────────────
    const months = clusters
        .filter((c) => c.orbs.length > 0)
        .map((c) => {
            const cm: Record<string, number> = {};
            for (const o of c.orbs) cm[o.moodLabel] = (cm[o.moodLabel] || 0) + 1;
            return {
                month: monthNames[c.month],
                captures: c.orbs.length,
                topMoods: Object.entries(cm)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([mood, count]) => ({ mood, count })),
            };
        });

    // ── Selected captures ───────────────────────────────────────────────
    const selectedSorted = [...selectedOrbs].sort((a, b) => a.timestamp - b.timestamp);
    const selected = selectedSorted.map((o) => ({
        date: fmt(o.timestamp),
        mood: o.moodLabel,
        tags: o.tags,
        ...(o.noteFull ? { note: o.noteFull } : {}),
    }));

    // ── Patterns ────────────────────────────────────────────────────────

    // Streaks
    const streaks = computeStreaks(sorted);

    // Transitions (year-wide, for selected moods)
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

    // Before/after selection
    let beforeSelection: Array<{ date: string; mood: string }> = [];
    let afterSelection: Array<{ date: string; mood: string }> = [];
    let sameMoodSameMonth: Array<{ date: string; mood: string }> = [];

    if (selectedSorted.length > 0) {
        const firstTs = selectedSorted[0].timestamp;
        const lastTs = selectedSorted[selectedSorted.length - 1].timestamp;

        beforeSelection = sorted
            .filter((o) => o.timestamp < firstTs)
            .slice(-5)
            .map((o) => ({ date: fmt(o.timestamp), mood: o.moodLabel }));

        afterSelection = sorted
            .filter((o) => o.timestamp > lastTs)
            .slice(0, 5)
            .map((o) => ({ date: fmt(o.timestamp), mood: o.moodLabel }));

        const selectedCluster = selectedSorted[0].clusterId;
        const selectedIdSet = new Set(selectedOrbs.map((o) => o.id));
        sameMoodSameMonth = sorted
            .filter((o) =>
                o.clusterId === selectedCluster &&
                selectedMoods.has(o.moodLabel) &&
                !selectedIdSet.has(o.id),
            )
            .slice(0, 8)
            .map((o) => ({ date: fmt(o.timestamp), mood: o.moodLabel }));
    }

    // ── Recency: last 14 captures ───────────────────────────────────────
    const recency = sorted.slice(-14).map((o) => ({
        date: fmtShort(o.timestamp),
        mood: o.moodLabel,
    }));

    // ── Build pack ──────────────────────────────────────────────────────
    const pack = {
        aggregates: {
            totalCaptures: allOrbs.length,
            moodCounts: topMoods,
            topTags,
        },
        months,
        selected: { mode: selectionMode, captures: selected },
        patterns: {
            streaks,
            transitions,
            beforeSelection,
            afterSelection,
            sameMoodSameMonth,
        },
        recency,
    };

    return JSON.stringify(pack);
}

// ── Main Chat Component ─────────────────────────────────────────────────

export function MoodverseExplainChat({
    selectedOrbs,
    allOrbs,
    clusters,
    selectionMode,
}: MoodverseExplainChatProps) {
    const {
        chatMessages,
        isAiLoading,
        addChatMessage,
        setAiLoading,
        setAiHighlightedOrbIds,
    } = useMoodverseStore();

    const [inputText, setInputText] = React.useState('');
    const flatListRef = useRef<any>(null);
    const inputRef = useRef<TextInput>(null);
    const hasInitialized = useRef(false);
    const [inputBarReady, setInputBarReady] = useState(false);

    // Focus the input once the input bar has laid out and the sheet has settled.
    // This fixes the race condition where the keyboard fails to open because
    // the BottomSheetTextInput isn't ready yet during the sheet animation.
    const handleInputBarLayout = useCallback(() => {
        if (!inputBarReady) setInputBarReady(true);
    }, [inputBarReady]);

    useEffect(() => {
        if (inputBarReady) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [inputBarReady]);

    // Build selected capture context
    const captureContexts: CaptureContext[] = React.useMemo(() => {
        return selectedOrbs.map((orb) => ({
            id: orb.id,
            mood: orb.moodLabel,
            note: orb.noteFull ?? undefined,
            tags: orb.tags,
            date: new Date(orb.timestamp).toISOString(),
            clusterId: orb.clusterId,
        }));
    }, [selectedOrbs]);

    // Build full moodverse context string (patterns, transitions, etc.)
    const moodverseContext = React.useMemo(() => {
        return computeMoodverseContext(selectedOrbs, allOrbs, clusters, selectionMode);
    }, [selectedOrbs, allOrbs, clusters, selectionMode]);

    // Store latest values in refs so the init effect always reads fresh data
    const sendArgsRef = useRef({ captureContexts, selectionMode, moodverseContext, selectedOrbs, allOrbs });
    sendArgsRef.current = { captureContexts, selectionMode, moodverseContext, selectedOrbs, allOrbs };

    const sendToAI = useCallback(async (history: ChatMessage[]) => {
        const { captureContexts: ctx, selectionMode: mode, moodverseContext: mvCtx, allOrbs: all, selectedOrbs: sel } = sendArgsRef.current;
        setAiLoading(true);

        console.log('[MoodverseExplain] sendToAI — allOrbs:', all.length, 'contextLength:', mvCtx.length);
        console.log('[MoodverseExplain] context preview:', mvCtx.slice(0, 400));

        try {
            const result = await callMoodverseExplain(
                ctx,
                mode,
                history,
                mvCtx,
            );

            if (result.ok && result.text) {
                const aiMsg: ChatMessage = {
                    id: result.requestId || `ai-${Date.now()}`,
                    role: 'assistant',
                    text: result.text,
                };
                addChatMessage(aiMsg);

                // Resolve highlighted moods → orb IDs
                if (result.highlightedMoods && result.highlightedMoods.length > 0) {
                    const moodSet = new Set(result.highlightedMoods.map((m) => m.toLowerCase()));
                    // Match against ALL orbs, not just selected
                    const matchedIds = all
                        .filter((o) => moodSet.has(o.moodLabel.toLowerCase()))
                        .map((o) => o.id);
                    setAiHighlightedOrbIds(matchedIds.length > 0 ? matchedIds : sel.map((o) => o.id));
                } else {
                    setAiHighlightedOrbIds(sel.map((o) => o.id));
                }
            } else {
                console.warn('[MoodverseExplain] AI returned non-ok:', result.error);
                addChatMessage({
                    id: `err-${Date.now()}`,
                    role: 'assistant',
                    text: "Something went quiet on my end. Try again in a moment.",
                });
            }
        } catch (err) {
            console.error('[MoodverseExplain] sendToAI exception:', err);
            addChatMessage({
                id: `err-${Date.now()}`,
                role: 'assistant',
                text: "Lost the connection for a second. Try again.",
            });
        } finally {
            setAiLoading(false);
        }
    }, [addChatMessage, setAiLoading, setAiHighlightedOrbIds]);

    // Auto-initialize: send greeting on first open
    useEffect(() => {
        if (hasInitialized.current || chatMessages.length > 0) return;
        hasInitialized.current = true;
        sendToAI([]);
    }, [sendToAI]);

    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text || isAiLoading) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            text,
        };
        addChatMessage(userMsg);
        setInputText('');

        const fullHistory = [...chatMessages, userMsg];
        sendToAI(fullHistory);
    }, [inputText, isAiLoading, chatMessages, addChatMessage, sendToAI]);

    useEffect(() => {
        if (chatMessages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [chatMessages.length]);

    const renderItem = useCallback(({ item }: { item: ChatMessage }) => (
        <ChatBubble message={item} />
    ), []);

    const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

    return (
        <View style={styles.container}>
            <BottomSheetFlatList
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
            />

            <View style={styles.inputBar} onLayout={handleInputBarLayout}>
                <BottomSheetTextInput
                    ref={inputRef}
                    style={styles.textInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Say something..."
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    multiline
                    maxLength={1200}
                    editable={!isAiLoading}
                    onSubmitEditing={handleSend}
                    blurOnSubmit={false}
                    returnKeyType="send"
                />
                <TouchableOpacity
                    style={[
                        styles.sendBtn,
                        (!inputText.trim() || isAiLoading) && styles.sendBtnDisabled,
                    ]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || isAiLoading}
                >
                    <Send
                        size={16}
                        color={
                            inputText.trim() && !isAiLoading
                                ? '#8B2252'
                                : 'rgba(255,255,255,0.15)'
                        }
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        paddingTop: 8,
        paddingBottom: 16,
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        paddingBottom: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    textInput: {
        flex: 1,
        minHeight: 38,
        maxHeight: 80,
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
