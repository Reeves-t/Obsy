import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    StyleSheet,
    View,
    Text,
    Pressable,
    ActivityIndicator,
    Modal,
    TextInput,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ChevronLeft, ChevronRight, Eye, PencilLine, Plus } from 'lucide-react-native';
import type { Topic, TopicStats } from '@/lib/topicStore';
import type { Capture } from '@/types/capture';
import { createSignedUrl } from '@/services/topicAttachments';
import { useBoardStore } from '@/lib/boardStore';
import { AmbientBackground } from '@/components/ui/AmbientBackground';
import { AddToBoardSheet, type AddBoardAction } from '@/components/topics/board/AddToBoardSheet';
import { BoardItemPicker, type BoardPickerMode } from '@/components/topics/board/BoardItemPicker';
import { TopicEntryItem } from '@/components/topics/TopicEntryTile';
import {
    buildInject,
    type BoardToRnMessage,
    type RnToBoardMessage,
} from '@/components/topics/board/boardBridge';

interface TopicBoardPageProps {
    topic: Topic;
    stats: TopicStats;
    isActive: boolean;
    onClose: () => void;
    topInset: number;
    bottomInset: number;
    /** Tell the pager to enable/disable horizontal swipe while editing/drawing. */
    onInteractingChange?: (busy: boolean) => void;
    /** This page's index in the pager, total page count, and a programmatic nav
     *  callback — used by the edge arrows since the WebView eats swipes. */
    pageIndex?: number;
    pageCount?: number;
    onGoToPage?: (index: number) => void;
}

// Relative (not '@/') so the asset resolves regardless of alias handling.
const BOARD_HTML = require('../../../assets/board/index.html');

// Forward WebView console + errors to the RN terminal (debug aid). Runs before
// the bundle loads, so it captures early errors too.
const CONSOLE_BRIDGE_JS = `
(function(){
  function send(level, args){
    try {
      var text = Array.prototype.slice.call(args).map(function(a){
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch(e){ return String(a); }
      }).join(' ');
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'console', level:level, text:text }));
    } catch(e){}
  }
  ['warn','error'].forEach(function(l){
    var orig = console[l];
    console[l] = function(){ send(l, arguments); orig && orig.apply(console, arguments); };
  });
  window.addEventListener('error', function(e){ send('error', [e.message + ' @ ' + (e.filename||'') + ':' + (e.lineno||'')]); });
  window.addEventListener('unhandledrejection', function(e){ send('error', ['unhandledrejection: ' + ((e.reason && e.reason.message) || e.reason)]); });
})();
true;
`;

// Map a picked entry/insight into an Obsy card payload for the canvas.
function mapItemToCard(item: TopicEntryItem): Extract<
    RnToBoardMessage,
    { type: 'addShape' }
>['shape'] {
    if (item.kind === 'capture') {
        const c: Capture = item.capture;
        const isLink = c.source_type === 'shared_link';
        return {
            kind: 'obsyCard',
            variant: 'entry',
            title: isLink ? c.shared_link_platform || 'Link' : c.mood_name_snapshot || 'Entry',
            body: c.note || c.shared_link_title || '',
            url: isLink ? c.shared_link_url ?? undefined : undefined,
            refId: c.id,
        };
    }
    if (item.kind === 'attachment') {
        return {
            kind: 'obsyCard',
            variant: 'note',
            title: item.attachment.file_name,
            body: '',
            refId: item.attachment.id,
        };
    }
    // note / insight / gap
    const variant = item.kind === 'insight' ? 'insight' : item.kind === 'missing_gaps' ? 'gap' : 'note';
    const title = variant === 'insight' ? 'Insight' : variant === 'gap' ? 'Gap' : 'Note';
    return {
        kind: 'obsyCard',
        variant,
        title,
        body: item.note.text,
        refId: item.note.id,
    };
}

/**
 * Page 2 — Board. A free, manual-first tldraw canvas where the user visually
 * curates the topic. The canvas runs in a WebView; this component owns the
 * native chrome, the add-content flows, persistence, and the swipe lock.
 */
export function TopicBoardPage({
    topic,
    isActive,
    onClose,
    topInset,
    onInteractingChange,
    pageIndex = 1,
    pageCount = 4,
    onGoToPage,
}: TopicBoardPageProps) {
    const webRef = useRef<WebView>(null);
    const board = useBoardStore((s) => s.getBoard(topic.id));
    const setBoard = useBoardStore((s) => s.setBoard);

    const [bundleUri, setBundleUri] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [isEmpty, setIsEmpty] = useState(board?.isEmpty ?? true);
    const [addOpen, setAddOpen] = useState(false);
    const [picker, setPicker] = useState<BoardPickerMode | null>(null);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkText, setLinkText] = useState('');

    const modeRef = useRef(mode);
    const pointerDownRef = useRef(false);
    const snapshotRef = useRef<unknown | null>(board?.snapshot ?? null);

    // Resolve the bundled tldraw HTML to a file URI for the WebView.
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const asset = Asset.fromModule(BOARD_HTML);
                await asset.downloadAsync();
                if (mounted) setBundleUri(asset.localUri ?? asset.uri);
            } catch (e) {
                console.warn('[board] failed to load bundle', e);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const post = useCallback((msg: RnToBoardMessage) => {
        webRef.current?.injectJavaScript(buildInject(msg));
    }, []);

    const updateBusy = useCallback(() => {
        onInteractingChange?.(modeRef.current === 'edit' || pointerDownRef.current);
    }, [onInteractingChange]);

    const applyMode = useCallback(
        (next: 'view' | 'edit') => {
            setMode(next);
            modeRef.current = next;
            post({ type: 'setMode', mode: next });
            updateBusy();
        },
        [post, updateBusy],
    );

    // When the user swipes away from the board, flush + re-enable swipe.
    useEffect(() => {
        if (!isActive) {
            post({ type: 'flush' });
            pointerDownRef.current = false;
            onInteractingChange?.(false);
        }
    }, [isActive, post, onInteractingChange]);

    const onMessage = useCallback(
        async (e: WebViewMessageEvent) => {
            let msg: BoardToRnMessage;
            try {
                msg = JSON.parse(e.nativeEvent.data) as BoardToRnMessage;
            } catch {
                return;
            }
            switch (msg.type) {
                case 'ready':
                    setReady(true);
                    post({
                        type: 'init',
                        snapshot: snapshotRef.current,
                        topicHue: topic.hue,
                        mode: modeRef.current,
                    });
                    break;
                case 'snapshot':
                    snapshotRef.current = msg.snapshot;
                    setIsEmpty(msg.isEmpty);
                    setBoard(topic.id, msg.snapshot, msg.isEmpty);
                    break;
                case 'requestAsset': {
                    const url = await createSignedUrl(msg.storagePath);
                    post({ type: 'resolveAsset', storagePath: msg.storagePath, url });
                    break;
                }
                case 'interaction':
                    pointerDownRef.current = msg.phase === 'start';
                    updateBusy();
                    break;
                case 'openItem':
                    // v1: tapping a card in view mode is a no-op (cards are self-contained).
                    break;
                case 'console':
                    console.log(`[board:${msg.level}]`, msg.text);
                    break;
            }
        },
        [post, setBoard, topic.id, topic.hue, updateBusy],
    );

    // ── Add-content handlers ────────────────────────────────────
    const ensureEditMode = useCallback(() => {
        if (modeRef.current !== 'edit') applyMode('edit');
    }, [applyMode]);

    const handleAddImage = useCallback(async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
            allowsMultipleSelection: false,
        });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];

        // Downscale + compress, then embed as a data URL so the canvas renders it
        // directly (no upload / signed-URL round-trip) and it survives reload.
        // Keep it modest — the data URL travels over injectJavaScript, which can
        // choke on very large payloads on Android.
        const targetWidth = Math.min(a.width || 768, 768);
        const manipulated = await manipulateAsync(
            a.uri,
            [{ resize: { width: targetWidth } }],
            { compress: 0.5, format: SaveFormat.JPEG, base64: true },
        );
        if (!manipulated.base64) {
            console.warn('[board] image manipulate returned no base64');
            return;
        }

        ensureEditMode();
        post({
            type: 'addShape',
            shape: {
                kind: 'image',
                dataUrl: `data:image/jpeg;base64,${manipulated.base64}`,
                width: manipulated.width,
                height: manipulated.height,
            },
        });
    }, [ensureEditMode, post]);

    const handleSelect = useCallback(
        (action: AddBoardAction) => {
            setAddOpen(false);
            switch (action) {
                case 'note':
                    ensureEditMode();
                    post({ type: 'addShape', shape: { kind: 'note', text: '' } });
                    break;
                case 'image':
                    handleAddImage();
                    break;
                case 'link':
                    setLinkText('');
                    setLinkOpen(true);
                    break;
                case 'entry':
                    setPicker('entry');
                    break;
                case 'insight':
                    setPicker('insight');
                    break;
            }
        },
        [ensureEditMode, handleAddImage, post],
    );

    const submitLink = useCallback(() => {
        const url = linkText.trim();
        setLinkOpen(false);
        if (!url) return;
        let host = url;
        try {
            host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
        } catch {
            /* keep raw */
        }
        ensureEditMode();
        post({
            type: 'addShape',
            shape: { kind: 'obsyCard', variant: 'link', title: host, body: '', url },
        });
    }, [ensureEditMode, linkText, post]);

    const handlePick = useCallback(
        (item: TopicEntryItem) => {
            ensureEditMode();
            post({ type: 'addShape', shape: mapItemToCard(item) });
        },
        [ensureEditMode, post],
    );

    const accent = `hsl(${topic.hue}, 70%, 62%)`;

    return (
        <View style={styles.root}>
            {/* App's atmospheric background, shown through the transparent canvas. */}
            <AmbientBackground screenName="topics" />

            {bundleUri ? (
                <WebView
                    ref={webRef}
                    source={{ uri: bundleUri }}
                    originWhitelist={['*']}
                    injectedJavaScriptBeforeContentLoaded={CONSOLE_BRIDGE_JS}
                    onMessage={onMessage}
                    javaScriptEnabled
                    domStorageEnabled
                    allowFileAccess
                    allowFileAccessFromFileURLs
                    allowUniversalAccessFromFileURLs
                    nestedScrollEnabled
                    setSupportMultipleWindows={false}
                    // `opaque` is iOS-only and missing from this version's types;
                    // needed so the transparent canvas shows the app background.
                    {...({ opaque: false } as object)}
                    style={styles.web}
                    containerStyle={styles.web}
                />
            ) : (
                <View style={styles.center}>
                    <ActivityIndicator color="rgba(255,255,255,0.6)" />
                </View>
            )}

            {/* Header chrome (overlaid on the canvas) */}
            <View style={[styles.header, { paddingTop: topInset }]} pointerEvents="box-none">
                <View style={styles.headerTextCol} pointerEvents="none">
                    <Text style={styles.title} numberOfLines={1}>
                        {topic.title}
                    </Text>
                    <Text style={styles.subtitle}>Board</Text>
                </View>
                <Pressable
                    onPress={() => applyMode(mode === 'edit' ? 'view' : 'edit')}
                    style={[styles.iconBtn, mode === 'edit' && { backgroundColor: accent }]}
                    hitSlop={8}
                    accessibilityLabel={mode === 'edit' ? 'Switch to view mode' : 'Edit board'}
                >
                    {mode === 'edit' ? (
                        <Eye size={16} color="#fff" />
                    ) : (
                        <PencilLine size={16} color="rgba(255,255,255,0.85)" />
                    )}
                </Pressable>
                <Pressable
                    onPress={() => setAddOpen(true)}
                    style={styles.iconBtn}
                    hitSlop={8}
                    accessibilityLabel="Add to board"
                >
                    <Plus size={18} color="rgba(255,255,255,0.85)" />
                </Pressable>
                <Pressable
                    onPress={onClose}
                    style={styles.iconBtn}
                    hitSlop={8}
                    accessibilityLabel="Close focus mode"
                >
                    <Text style={styles.closeGlyph}>✕</Text>
                </Pressable>
            </View>

            {/* Edge nav arrows — the WebView swallows swipes, so these are the way
                between pages while on the Board. Shown only in View mode (editing
                off = transition mode); Edit mode shows the tldraw toolbar instead. */}
            {mode === 'view' && pageIndex > 0 && (
                <Pressable
                    onPress={() => onGoToPage?.(pageIndex - 1)}
                    style={[styles.navArrow, styles.navArrowLeft]}
                    hitSlop={10}
                    accessibilityLabel="Previous page"
                >
                    <ChevronLeft size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
            )}
            {mode === 'view' && pageIndex < pageCount - 1 && (
                <Pressable
                    onPress={() => onGoToPage?.(pageIndex + 1)}
                    style={[styles.navArrow, styles.navArrowRight]}
                    hitSlop={10}
                    accessibilityLabel="Next page"
                >
                    <ChevronRight size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
            )}

            {/* Empty state overlay */}
            {ready && isEmpty && (
                <View style={styles.empty} pointerEvents="box-none">
                    <View style={styles.emptyCard} pointerEvents="auto">
                        <Text style={styles.emptyTitle}>Build this topic visually</Text>
                        <Text style={styles.emptyBody}>
                            Add images, notes, links, entries, or insights — arrange them
                            however this topic lives in your head.
                        </Text>
                        <View style={styles.emptyBtns}>
                            <Pressable style={styles.emptyBtn} onPress={() => handleSelect('note')}>
                                <Text style={styles.emptyBtnText}>Add Note</Text>
                            </Pressable>
                            <Pressable style={styles.emptyBtn} onPress={() => handleSelect('image')}>
                                <Text style={styles.emptyBtnText}>Add Image</Text>
                            </Pressable>
                            <Pressable style={styles.emptyBtn} onPress={() => handleSelect('entry')}>
                                <Text style={styles.emptyBtnText}>Add Entry</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            )}

            <AddToBoardSheet
                visible={addOpen}
                onClose={() => setAddOpen(false)}
                onSelect={handleSelect}
            />

            <BoardItemPicker
                visible={picker !== null}
                mode={picker ?? 'entry'}
                topicId={topic.id}
                onClose={() => setPicker(null)}
                onPick={handlePick}
            />

            {/* Link input */}
            <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
                <Pressable style={styles.linkBackdrop} onPress={() => setLinkOpen(false)} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.linkCenter}
                    pointerEvents="box-none"
                >
                    <View style={styles.linkCard}>
                        <Text style={styles.linkLabel}>Add a link</Text>
                        <TextInput
                            value={linkText}
                            onChangeText={setLinkText}
                            placeholder="https://…"
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            autoFocus
                            style={styles.linkInput}
                            onSubmitEditing={submitLink}
                        />
                        <View style={styles.linkBtns}>
                            <Pressable onPress={() => setLinkOpen(false)} hitSlop={8}>
                                <Text style={styles.linkCancel}>Cancel</Text>
                            </Pressable>
                            <Pressable onPress={submitLink} hitSlop={8} disabled={!linkText.trim()}>
                                <Text style={[styles.linkAdd, !linkText.trim() && styles.linkAddDisabled]}>
                                    Add
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    web: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    navArrow: {
        position: 'absolute',
        top: '50%',
        marginTop: -22,
        width: 36,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(16,16,22,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    navArrowLeft: {
        left: 6,
    },
    navArrowRight: {
        right: 6,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 10,
    },
    headerTextCol: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 2,
        letterSpacing: 0.2,
    },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(20,20,28,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeGlyph: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
    empty: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    emptyCard: {
        backgroundColor: 'rgba(16,16,22,0.92)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 22,
        gap: 10,
        maxWidth: 340,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
    },
    emptyBody: {
        fontSize: 13.5,
        color: 'rgba(255,255,255,0.6)',
        lineHeight: 20,
        textAlign: 'center',
    },
    emptyBtns: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginTop: 6,
    },
    emptyBtn: {
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    emptyBtnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    linkBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    linkCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    linkCard: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#15151c',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 18,
        gap: 14,
    },
    linkLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    linkInput: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#fff',
        fontSize: 15,
    },
    linkBtns: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 22,
    },
    linkCancel: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
    },
    linkAdd: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    linkAddDisabled: {
        color: 'rgba(255,255,255,0.25)',
    },
});
