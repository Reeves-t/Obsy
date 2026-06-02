import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    Pressable,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Topic } from '@/lib/topicStore';
import { TopicPageHeader } from './TopicPageHeader';
import { TeaserLock } from './TeaserLock';

interface FocusPageScaffoldProps {
    topic: Topic;
    entryCount: number;
    pageLabel: string;
    onClose: () => void;
    topInset: number;
    bottomInset: number;

    locked: boolean;
    teaserVariant: 'discover' | 'evolve';
    onUnlock: () => void;

    hasData: boolean; // topic has entries to analyse
    ready: boolean; // generated payload available
    loading: boolean;
    error: string | null;
    onRetry: () => void;

    emptyMessage: string;
    loadingMessage: string;

    generatedAt?: string;
    onRefresh?: () => void;

    /** Rendered only when `ready` is true. */
    children: React.ReactNode;
}

function RefreshIcon() {
    return (
        <Svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <Path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function formatRelative(iso?: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Updated ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `Updated ${days}d ago`;
}

export function FocusPageScaffold({
    topic,
    entryCount,
    pageLabel,
    onClose,
    topInset,
    bottomInset,
    locked,
    teaserVariant,
    onUnlock,
    hasData,
    ready,
    loading,
    error,
    onRetry,
    emptyMessage,
    loadingMessage,
    generatedAt,
    onRefresh,
    children,
}: FocusPageScaffoldProps) {
    return (
        <View style={[styles.root, { paddingTop: topInset }]}>
            <TopicPageHeader topic={topic} entryCount={entryCount} pageLabel={pageLabel} onClose={onClose} />

            {locked ? (
                <View style={styles.teaserWrap}>
                    <TeaserLock variant={teaserVariant} onUnlock={onUnlock} />
                </View>
            ) : (
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 24 }]}
                    showsVerticalScrollIndicator={false}
                >
                    {!hasData ? (
                        <View style={styles.centerBox}>
                            <Text style={styles.emptyText}>{emptyMessage}</Text>
                        </View>
                    ) : ready ? (
                        <>
                            {children}
                            {onRefresh && (
                                <Pressable
                                    style={styles.refreshRow}
                                    onPress={onRefresh}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                                    ) : (
                                        <RefreshIcon />
                                    )}
                                    <Text style={styles.refreshText}>
                                        {loading ? 'Refreshing…' : 'Refresh'}
                                    </Text>
                                    {!loading && !!generatedAt && (
                                        <Text style={styles.refreshTime}>{'·'} {formatRelative(generatedAt)}</Text>
                                    )}
                                </Pressable>
                            )}
                        </>
                    ) : error ? (
                        <View style={styles.centerBox}>
                            <Text style={styles.errorText}>{error}</Text>
                            <Pressable style={styles.retryBtn} onPress={onRetry} disabled={loading}>
                                <Text style={styles.retryText}>{loading ? 'Trying…' : 'Try again'}</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.centerBox}>
                            <ActivityIndicator color="rgba(255,255,255,0.6)" />
                            <Text style={styles.loadingText}>{loadingMessage}</Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        paddingHorizontal: 18,
    },
    teaserWrap: {
        flex: 1,
        paddingVertical: 14,
    },
    scroll: {
        flex: 1,
        marginTop: 14,
    },
    scrollContent: {
        gap: 12,
    },
    centerBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 20,
        gap: 14,
    },
    emptyText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        lineHeight: 21,
    },
    loadingText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
    errorText: {
        fontSize: 14,
        color: 'rgba(255,180,160,0.85)',
        textAlign: 'center',
        lineHeight: 21,
    },
    retryBtn: {
        paddingVertical: 9,
        paddingHorizontal: 20,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    retryText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.8)',
    },
    refreshRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 12,
        marginTop: 2,
    },
    refreshText: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },
    refreshTime: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.35)',
    },
});
