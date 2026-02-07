import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { GlassCard } from '@/components/ui/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Album {
    id: string;
    name: string;
}

interface DestinationSelectorProps {
    albums: Album[];
    selectedIds: string[];
    onToggle: (id: string) => void;
}

export function DestinationSelector({ albums, selectedIds, onToggle }: DestinationSelectorProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { colors } = useObsyTheme();

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const getSummary = () => {
        if (selectedIds.length === 0) return "Select Destination";

        const names = [];
        if (selectedIds.includes('private')) names.push("Private Journal");

        const selectedAlbums = albums.filter(a => selectedIds.includes(a.id));
        selectedAlbums.forEach(a => names.push(a.name));

        if (names.length === 0) return "Select Destination";
        if (names.length === 1) return names[0];
        if (names.length === 2) return `${names[0]} & ${names[1]}`;
        return `${names[0]} + ${names.length - 1} others`;
    };

    const isPrivateSelected = selectedIds.includes('private');

    return (
        <View style={styles.container}>
            <ThemedText type="caption" style={styles.label}>POST TO</ThemedText>

            <TouchableOpacity
                style={styles.headerBlock}
                onPress={toggleExpand}
                activeOpacity={0.8}
            >
                <View style={styles.headerContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="share-social" size={18} color={Colors.obsy.silver} />
                    </View>
                    <View style={styles.headerTextContainer}>
                        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>{getSummary()}</ThemedText>
                        <ThemedText style={[styles.headerSubtitle, { color: colors.textTertiary }]}>
                            {selectedIds.length === 0 ? "Tap to select" : "Visible to selected groups"}
                        </ThemedText>
                    </View>
                </View>

                <View style={styles.expandTrigger}>
                    <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="rgba(255,255,255,0.4)"
                    />
                </View>
            </TouchableOpacity>

            {isExpanded && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.listContainer}>
                    {/* Private Journal Option */}
                    <TouchableOpacity
                        onPress={() => onToggle('private')}
                        style={styles.optionRow}
                    >
                        <View style={[styles.optionContainer, isPrivateSelected && styles.optionContainerSelected]}>
                            <View style={styles.optionContent}>
                                <View style={styles.optionIcon}>
                                    <Ionicons name="home" size={20} color={isPrivateSelected ? Colors.obsy.silver : "white"} />
                                </View>
                                <View style={styles.optionText}>
                                    <ThemedText style={[styles.optionTitle, { color: colors.text }]}>Private Journal</ThemedText>
                                    <ThemedText style={[styles.optionSubtitle, { color: colors.textSecondary }]}>Only visible to you</ThemedText>
                                </View>
                                <View style={[styles.checkbox, isPrivateSelected && styles.checkboxSelected]}>
                                    {isPrivateSelected && <Ionicons name="checkmark" size={14} color="black" />}
                                </View>
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Albums */}
                    {albums.length > 0 && (
                        <ThemedText style={styles.sectionHeader}>ALBUMS</ThemedText>
                    )}

                    {albums.map(album => {
                        const isSelected = selectedIds.includes(album.id);
                        return (
                            <TouchableOpacity
                                key={album.id}
                                onPress={() => onToggle(album.id)}
                                style={styles.optionRow}
                            >
                                <View style={[styles.optionContainer, isSelected && styles.optionContainerSelected]}>
                                    <View style={styles.optionContent}>
                                        <View style={styles.optionText}>
                                            <ThemedText style={[styles.optionTitle, { color: colors.text }]}>{album.name}</ThemedText>
                                        </View>
                                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                            {isSelected && <Ionicons name="checkmark" size={14} color="black" />}
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 12,
    },
    label: {
        marginLeft: 4,
        letterSpacing: 1,
    },
    headerBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 100,
        paddingLeft: 16,
        paddingRight: 8,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    headerContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
    },
    headerSubtitle: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
    },
    expandTrigger: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContainer: {
        gap: 8,
        marginTop: 4,
    },
    optionRow: {
        marginBottom: 2,
    },
    optionContainer: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    optionContainerSelected: {
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    optionIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionText: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
    },
    optionSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: Colors.obsy.silver,
        borderColor: Colors.obsy.silver,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
        marginBottom: 4,
        marginLeft: 4,
        letterSpacing: 1,
    },
});
