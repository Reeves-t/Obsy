import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    FlatList,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Text,
    Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ArrowUp, FileText } from 'lucide-react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import type { ChatMessage } from '@/lib/moodverseStore';
import { useCaptureStore } from '@/lib/captureStore';
import { useTopicStore } from '@/lib/topicStore';
import { useAuth } from '@/contexts/AuthContext';
import { callTopicChat, generateTopicNote } from '@/services/topicChatClient';
import { ObsyIcon } from '@/components/moodverse/ObsyIcon';
import { useAiFreeMode } from '@/hooks/useAiFreeMode';

// Show note helper after this many AI responses
const NOTE_THRESHOLD = 3;

// ── Eclipse Loader ──────────────────────────────────────────────────────

function EclipseLoader() {
    const [frame, setFrame] = React.useState(0);

    useEffect(() => {
        const interval = setInterval(() => setFrame(f => (f + 1) % 60), 50);
        return () => clearInterval(interval);
    }, []);

    const angle = (frame / 60) * Math.PI * 2;
    const cx = 16 + Math.cos(angle) * 8;
    const cy = 16 + Math.sin(angle) * 8;

    return (
        <View style={eclipseStyles.container}>
            <View style={eclipseStyles.disc} />
            <View style={[eclipseStyles.orbiter, { left: cx - 3, top: cy - 3 }]} />
        </View>
    );
}

const eclipseStyles = StyleSheet.create({
    container: { width: 32, height: 32, alignSelf: 'flex-start', marginLeft: 4, marginVertical: 8 },
    disc: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(139,34,82,0.15)', left: 8, top: 8 },
    orbiter: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(139,34,82,0.7)' },
});

// ── Chat Bubble ─────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user';

    if (isUser) {
        return (
            <View style={[bubbleStyles.container, bubbleStyles.userContainer]}>
                <View style={bubbleStyles.userBubble}>
                    <ThemedText style={bubbleStyles.userText}>{message.text}</ThemedText>
                </View>
            </View>
        );
    }

    // Assistant: bubbleless prose directly on the background
    return (
        <View style={[bubbleStyles.container, bubbleStyles.assistantContainer]}>
            <ThemedText style={bubbleStyles.assistantText}>{message.text}</ThemedText>
        </View>
    );
}

const bubbleStyles = StyleSheet.create({
    container: { paddingHorizontal: 16 },
    userContainer: { alignItems: 'flex-end', marginVertical: 4 },
    assistantContainer: { alignItems: 'flex-start', marginVertical: 10, maxWidth: '92%' },
    userBubble: {
        maxWidth: '85%',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: 'rgba(139,34,82,0.22)',
        borderBottomRightRadius: 4,
    },
    userText: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.85)' },
    assistantText: { fontSize: 17, lineHeight: 27, color: 'rgba(255,255,255,0.88)', fontWeight: '400' },
});

// ── Note Approval Card ──────────────────────────────────────────────────

interface NoteApprovalCardProps {
    draftNote: string;
    onNoteChange: (text: string) => void;
    onSave: () => void;
    onDismiss: () => void;
}

function NoteApprovalCard({ draftNote, onNoteChange, onSave, onDismiss }: NoteApprovalCardProps) {
    return (
        <View style={noteCardStyles.card}>
            <View style={noteCardStyles.headerRow}>
                <Text style={noteCardStyles.heading}>Review this note before saving</Text>
            </View>
            <Text style={noteCardStyles.subtext}>
                This will be added to your topic feed and dashboard.
            </Text>
            <TextInput
                style={noteCardStyles.noteInput}
                value={draftNote}
                onChangeText={onNoteChange}
                multiline
                maxLength={500}
                placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <View style={noteCardStyles.actions}>
                <TouchableOpacity style={noteCardStyles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
                    <Text style={noteCardStyles.dismissText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={noteCardStyles.saveBtn} onPress={onSave} activeOpacity={0.8}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.96)', 'rgba(232,234,240,0.92)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={noteCardStyles.saveText}>Save note</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const noteCardStyles = StyleSheet.create({
    card: {
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 16,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    headerRow: {
        marginBottom: 4,
    },
    heading: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.1,
    },
    subtext: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.45)',
        marginBottom: 12,
        lineHeight: 16,
    },
    noteInput: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 21,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        padding: 12,
        minHeight: 72,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        marginBottom: 14,
    },
    actions: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'flex-end',
    },
    dismissBtn: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dismissText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.55)',
    },
    saveBtn: {
        paddingVertical: 9,
        paddingHorizontal: 20,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    saveText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0b0c10',
    },
});

// ── Note Helper Banner ──────────────────────────────────────────────────

interface NoteHelperBannerProps {
    onPress: () => void;
    isGenerating: boolean;
}

function NoteHelperBanner({ onPress, isGenerating }: NoteHelperBannerProps) {
    if (isGenerating) {
        return (
            <View style={helperStyles.banner}>
                <EclipseLoader />
                <Text style={helperStyles.bannerText}>Creating note...</Text>
            </View>
        );
    }

    return (
        <TouchableOpacity style={helperStyles.banner} onPress={onPress} activeOpacity={0.7}>
            <FileText size={13} color="rgba(255,255,255,0.5)" />
            <Text style={helperStyles.bannerText}>Create a note from this chat</Text>
        </TouchableOpacity>
    );
}

const helperStyles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        marginHorizontal: 16,
        marginBottom: 6,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        alignSelf: 'stretch',
    },
    bannerText: {
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '500',
        letterSpacing: 0.1,
    },
});

// ── Main Screen ─────────────────────────────────────────────────────────

export default function TopicChatScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { topicId, topicTitle } = useLocalSearchParams<{ topicId: string; topicTitle: string }>();
    const { captures } = useCaptureStore();
    const { topics, getStats, addTopicNote } = useTopicStore();
    const { aiFreeMode } = useAiFreeMode();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    // Note creation state
    const [showNoteHelper, setShowNoteHelper] = useState(false);
    const [isGeneratingNote, setIsGeneratingNote] = useState(false);
    const [draftNote, setDraftNote] = useState('');
    const [isNoteApprovalVisible, setIsNoteApprovalVisible] = useState(false);
    const [noteDismissedThisSession, setNoteDismissedThisSession] = useState(false);

    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const hasInitialized = useRef(false);

    const topic = useMemo(() => topics.find(t => t.id === topicId), [topics, topicId]);
    const stats = useMemo(() => {
        if (!topicId) return null;
        return getStats(topicId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topicId, getStats, captures.length]);

    const aiResponseCount = useMemo(
        () => messages.filter(m => m.role === 'assistant').length,
        [messages],
    );

    // Reveal note helper once threshold is reached
    useEffect(() => {
        if (
            aiResponseCount >= NOTE_THRESHOLD &&
            !noteDismissedThisSession &&
            !isNoteApprovalVisible &&
            !showNoteHelper
        ) {
            setShowNoteHelper(true);
        }
    }, [aiResponseCount, noteDismissedThisSession, isNoteApprovalVisible, showNoteHelper]);

    const sendToAI = useCallback(async (history: ChatMessage[]) => {
        if (!topic || !stats || aiFreeMode) return;
        setIsLoading(true);
        try {
            const result = await callTopicChat(topic, stats, captures, history);
            if (result.ok && result.text) {
                setMessages(prev => [...prev, {
                    id: result.requestId || `ai-${Date.now()}`,
                    role: 'assistant',
                    text: result.text!,
                }]);
            } else {
                setMessages(prev => [...prev, {
                    id: `err-${Date.now()}`,
                    role: 'assistant',
                    text: "Something went quiet on my end. Try again in a moment.",
                }]);
            }
        } catch {
            setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                role: 'assistant',
                text: "Lost the connection for a second. Try again.",
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [topic, stats, captures, aiFreeMode]);

    // Auto-initialize with Obsy's opening message
    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;
        sendToAI([]);
    }, [sendToAI]);

    // Auto-focus input after mount
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 400);
        return () => clearTimeout(timer);
    }, []);

    // Track keyboard visibility to fix bottom padding gap
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    // Scroll to end on new messages
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [messages.length]);

    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text || isLoading) return;

        const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };
        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        sendToAI([...messages, userMsg]);
    }, [inputText, isLoading, messages, sendToAI]);

    const handleCreateNote = useCallback(async () => {
        if (!topic || !stats) return;
        setShowNoteHelper(false);
        setIsGeneratingNote(true);
        try {
            const result = await generateTopicNote(topic, stats, captures, messages);
            if (result.ok && result.text) {
                setDraftNote(result.text);
                setIsNoteApprovalVisible(true);
            } else {
                setShowNoteHelper(true);
            }
        } catch {
            setShowNoteHelper(true);
        } finally {
            setIsGeneratingNote(false);
        }
    }, [topic, stats, captures, messages]);

    const handleSaveNote = useCallback(() => {
        if (!topicId || !draftNote.trim()) return;
        addTopicNote(topicId, draftNote.trim());
        setIsNoteApprovalVisible(false);
        setDraftNote('');
        setNoteDismissedThisSession(true);
    }, [topicId, draftNote, addTopicNote]);

    const handleDismissNote = useCallback(() => {
        setIsNoteApprovalVisible(false);
        setDraftNote('');
        setNoteDismissedThisSession(true);
    }, []);

    const renderItem = useCallback(({ item }: { item: ChatMessage }) => (
        <ChatBubble message={item} />
    ), []);

    const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

    const displayTitle = topicTitle || topic?.title || 'Topic';

    if (aiFreeMode) {
        return (
            <View style={[styles.root, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
                <ThemedText style={{ opacity: 0.8, textAlign: 'center' }}>
                    AI-Free mode is enabled, so Ask Obsy is unavailable.
                </ThemedText>
            </View>
        );
    }

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#e4e4ed" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <View style={styles.iconGlow}>
                        <ObsyIcon size={28} />
                    </View>
                    <View style={styles.headerLabels}>
                        <Text style={styles.headerTitle}>Ask Obsy</Text>
                        <Text style={styles.headerTopic} numberOfLines={1}>{displayTitle}</Text>
                    </View>
                </View>

                <View style={styles.headerRight} />
            </View>

            {/* Ambient glow behind header */}
            <View style={styles.glowContainer} pointerEvents="none">
                <LinearGradient
                    colors={['rgba(139,34,82,0.10)', 'transparent']}
                    style={styles.glowGradient}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                />
            </View>

            {/* Chat area */}
            <KeyboardAvoidingView
                style={styles.chatArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={insets.top + 60}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    style={styles.messageList}
                    contentContainerStyle={styles.messageListContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    ListFooterComponent={isLoading ? <EclipseLoader /> : null}
                    ListEmptyComponent={
                        !isLoading ? (
                            <View style={styles.emptyChat}>
                                <ObsyIcon size={52} />
                                <Text style={styles.emptyChatText}>Starting conversation...</Text>
                            </View>
                        ) : null
                    }
                />

                {/* Note approval card — replaces helper */}
                {isNoteApprovalVisible && (
                    <NoteApprovalCard
                        draftNote={draftNote}
                        onNoteChange={setDraftNote}
                        onSave={handleSaveNote}
                        onDismiss={handleDismissNote}
                    />
                )}

                {/* Note helper banner — shows after enough exchanges */}
                {(showNoteHelper || isGeneratingNote) && !isNoteApprovalVisible && (
                    <NoteHelperBanner
                        onPress={handleCreateNote}
                        isGenerating={isGeneratingNote}
                    />
                )}

                {/* Input bar */}
                <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8) }]}>
                    <TextInput
                        ref={inputRef}
                        style={styles.textInput}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={`Reflect on ${displayTitle}...`}
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        multiline
                        maxLength={1200}
                        editable={!isLoading}
                        onSubmitEditing={handleSend}
                        blurOnSubmit={false}
                        returnKeyType="send"
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || isLoading}
                    >
                        <ArrowUp
                            size={18}
                            color={inputText.trim() && !isLoading ? '#fff' : 'rgba(255,255,255,0.3)'}
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
    // ── Header ─────────────────────────────────────────────────
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    iconGlow: {
        shadowColor: '#8B2252',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 6,
    },
    headerLabels: {
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.1,
        lineHeight: 19,
    },
    headerTopic: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: 0.1,
        lineHeight: 16,
        maxWidth: 160,
    },
    headerRight: {
        width: 40,
    },
    // ── Glow ───────────────────────────────────────────────────
    glowContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 120,
        zIndex: 0,
    },
    glowGradient: {
        flex: 1,
    },
    // ── Chat ───────────────────────────────────────────────────
    chatArea: {
        flex: 1,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingTop: 12,
        paddingBottom: 8,
    },
    emptyChat: {
        flex: 1,
        minHeight: 160,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    emptyChatText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.3)',
    },
    // ── Input ──────────────────────────────────────────────────
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 10,
        gap: 8,
    },
    textInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 16,
        paddingTop: 11,
        paddingBottom: 11,
        color: '#fff',
        fontSize: 15,
        lineHeight: 22,
    },
    sendBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(139,34,82,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    sendBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
});
