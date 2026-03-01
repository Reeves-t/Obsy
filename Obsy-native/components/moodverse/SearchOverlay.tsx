import React, { useState, useCallback } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { X, Search, Sparkles } from 'lucide-react-native';
import { useMoodverseStore } from '@/lib/moodverseStore';
import type { GalaxyOrb } from './galaxyTypes';

interface SearchOverlayProps {
    visible: boolean;
    onClose: () => void;
    orbs: GalaxyOrb[];
}

/** Placeholder for future AI-powered analysis */
export function analyzeMoodverseSelection(
    _query: string,
    _dataSubset: GalaxyOrb[],
): string {
    return 'AI analysis is coming soon with Obsy+.';
}

export function SearchOverlay({ visible, onClose, orbs }: SearchOverlayProps) {
    const [query, setQuery] = useState('');
    const { setSearchResultIds } = useMoodverseStore();

    const runSearch = useCallback((text: string) => {
        setQuery(text);
        if (text.trim().length === 0) {
            setSearchResultIds([]);
            return;
        }

        const lower = text.toLowerCase().trim();
        const results = orbs.filter((orb) => {
            // Match mood name
            if (orb.moodLabel.toLowerCase().includes(lower)) return true;
            // Match tags
            if (orb.tags.some((t) => t.toLowerCase().includes(lower))) return true;
            // Match date key (YYYY-MM-DD or partial like "2026-03")
            if (orb.dateKey.includes(lower)) return true;
            // Match note preview
            if (orb.notePreview?.toLowerCase().includes(lower)) return true;
            return false;
        });

        setSearchResultIds(results.map((r) => r.id));
    }, [orbs, setSearchResultIds]);

    const resultCount = useMoodverseStore((s) => s.searchResultIds.length);

    const handleClose = useCallback(() => {
        setQuery('');
        setSearchResultIds([]);
        onClose();
    }, [onClose, setSearchResultIds]);

    const handleApply = useCallback(() => {
        const ids = useMoodverseStore.getState().searchResultIds;
        if (ids.length > 0) {
            useMoodverseStore.getState().selectMultiple(ids);
        }
        onClose();
    }, [onClose]);

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    {/* Header */}
                    <View style={styles.header}>
                        <ThemedText style={styles.title}>Search Moodverse</ThemedText>
                        <TouchableOpacity onPress={handleClose}>
                            <X size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    </View>

                    {/* Search input */}
                    <View style={styles.inputRow}>
                        <Search size={16} color="rgba(255,255,255,0.3)" />
                        <TextInput
                            style={styles.input}
                            placeholder="mood, tag, or date..."
                            placeholderTextColor="rgba(255,255,255,0.2)"
                            value={query}
                            onChangeText={runSearch}
                            autoFocus
                        />
                    </View>

                    {/* Results summary */}
                    {query.trim().length > 0 && (
                        <ThemedText style={styles.resultCount}>
                            {resultCount} matching {resultCount === 1 ? 'capture' : 'captures'}
                        </ThemedText>
                    )}

                    {/* Quick filters */}
                    <View style={styles.quickFilters}>
                        <ThemedText style={styles.filterLabel}>Quick filters</ThemedText>
                        <View style={styles.filterRow}>
                            {['calm', 'happy', 'anxious', 'sad', 'morning', 'evening'].map((f) => (
                                <TouchableOpacity
                                    key={f}
                                    style={[
                                        styles.filterChip,
                                        query === f && styles.filterChipActive,
                                    ]}
                                    onPress={() => runSearch(query === f ? '' : f)}
                                >
                                    <ThemedText style={[
                                        styles.filterChipText,
                                        query === f && styles.filterChipTextActive,
                                    ]}>
                                        {f}
                                    </ThemedText>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Obsy+ AI teaser */}
                    <View style={styles.aiTeaser}>
                        <Sparkles size={14} color="rgba(168, 85, 247, 0.5)" />
                        <ThemedText style={styles.aiTeaserText}>
                            Ask natural language questions with Obsy+
                        </ThemedText>
                    </View>

                    {/* Apply button */}
                    {resultCount > 0 && (
                        <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                            <ThemedText style={styles.applyText}>
                                Highlight {resultCount} results
                            </ThemedText>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 6, 8, 0.85)',
        justifyContent: 'flex-start',
        paddingTop: 80,
        paddingHorizontal: 16,
    },
    sheet: {
        backgroundColor: '#101018',
        borderRadius: 20,
        padding: 20,
        gap: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: '#fff',
    },
    resultCount: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
    },
    quickFilters: {
        gap: 8,
    },
    filterLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.25)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    filterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    filterChipActive: {
        borderColor: 'rgba(168, 85, 247, 0.4)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
    },
    filterChipText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
    },
    filterChipTextActive: {
        color: '#a855f7',
    },
    aiTeaser: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(168, 85, 247, 0.05)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(168, 85, 247, 0.1)',
    },
    aiTeaserText: {
        fontSize: 13,
        color: 'rgba(168, 85, 247, 0.6)',
    },
    applyBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        paddingVertical: 12,
        alignItems: 'center',
    },
    applyText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
});
