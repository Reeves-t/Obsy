import React, { useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, Dimensions, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import { DayPixelGrid } from './DayPixelGrid';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PALETTE_WIDTH = 70;
const CONTENT_PADDING = 24;
const GRID_WIDTH = Math.min(SCREEN_WIDTH - CONTENT_PADDING * 2 - PALETTE_WIDTH - 16, 320);

interface DayPixelModalProps {
    visible: boolean;
    date: string; // YYYY-MM-DD
    onClose: () => void;
}

export const DayPixelModal: React.FC<DayPixelModalProps> = ({ visible, date, onClose }) => {
    const { colors, isDark, isLight } = useObsyTheme();
    const { legend, activeColorId, setActiveColorId, clearGrid } = useYearInPixelsStore();

    const dateObj = new Date(date + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const mutedText = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)' }]}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <View style={styles.titleContainer}>
                            <ThemedText style={styles.dateText}>{formattedDate}</ThemedText>
                        </View>
                        <TouchableOpacity onPress={() => clearGrid(date)} style={styles.clearButton}>
                            <Ionicons name="refresh-outline" size={20} color={colors.textTertiary} />
                        </TouchableOpacity>
                    </View>

                    {/* Grid + Palette */}
                    <View style={styles.contentRow}>
                        <DayPixelGrid date={date} gridWidth={GRID_WIDTH} />

                        {/* Inline Palette */}
                        <View style={styles.palette}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.swatchList}>
                                {legend.map((item) => {
                                    const isActive = activeColorId === item.id;
                                    return (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={styles.swatchRow}
                                            onPress={() => setActiveColorId(isActive ? null : item.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[
                                                styles.swatch,
                                                { backgroundColor: item.color },
                                                isActive && styles.activeSwatch,
                                            ]} />
                                            <ThemedText style={[styles.swatchLabel, { color: mutedText }]} numberOfLines={1}>
                                                {item.label}
                                            </ThemedText>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>

                    {/* Hint */}
                    <ThemedText style={[styles.hint, { color: mutedText }]}>
                        Tap to paint · Long-press to erase
                    </ThemedText>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: CONTENT_PADDING,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 40,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    titleContainer: {
        alignItems: 'center',
    },
    dateText: {
        fontSize: 18,
        fontWeight: '600',
    },
    clearButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 16,
    },
    palette: {
        width: PALETTE_WIDTH,
        maxHeight: GRID_WIDTH,
    },
    swatchList: {
        alignItems: 'center',
        gap: 12,
        paddingVertical: 4,
    },
    swatchRow: {
        alignItems: 'center',
        gap: 3,
    },
    swatch: {
        width: 28,
        height: 28,
        borderRadius: 8,
    },
    activeSwatch: {
        borderWidth: 2,
        borderColor: '#D4AF37',
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 3,
    },
    swatchLabel: {
        fontSize: 8,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: 48,
    },
    hint: {
        fontSize: 11,
        textAlign: 'center',
        marginTop: 24,
    },
});
