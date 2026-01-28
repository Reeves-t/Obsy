import React from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { GlassCard } from '@/components/ui/GlassCard';

interface YearInPixelsInfoModalProps {
    visible: boolean;
    onClose: () => void;
}

export const YearInPixelsInfoModal: React.FC<YearInPixelsInfoModalProps> = ({ visible, onClose }) => {
    const { colors, isDark } = useObsyTheme();
    const { width: windowWidth } = useWindowDimensions();

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
                    <View style={styles.header}>
                        <ThemedText style={styles.title}>Year in Pixels</ThemedText>
                        <ThemedText style={[styles.subheader, { color: colors.textTertiary }]}>Observe your days</ThemedText>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.body}>
                        <View style={styles.bulletRow}>
                            <ThemedText style={[styles.bullet, { color: colors.textTertiary }]}>•</ThemedText>
                            <ThemedText style={[styles.bulletText, { color: colors.textSecondary }]}>Tap a day to color how it felt</ThemedText>
                        </View>
                        <View style={styles.bulletRow}>
                            <ThemedText style={[styles.bullet, { color: colors.textTertiary }]}>•</ThemedText>
                            <ThemedText style={[styles.bulletText, { color: colors.textSecondary }]}>Use the key to create and select moods</ThemedText>
                        </View>
                        <View style={styles.bulletRow}>
                            <ThemedText style={[styles.bullet, { color: colors.textTertiary }]}>•</ThemedText>
                            <ThemedText style={[styles.bulletText, { color: colors.textSecondary }]}>Long-press a day to add or edit brush strokes</ThemedText>
                        </View>
                        <View style={styles.bulletRow}>
                            <ThemedText style={[styles.bullet, { color: colors.textTertiary }]}>•</ThemedText>
                            <ThemedText style={[styles.bulletText, { color: colors.textSecondary }]}>Future days are locked until they happen</ThemedText>
                        </View>
                    </View>

                    <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent || '#4a9eff' }]} onPress={onClose}>
                        <ThemedText style={[styles.buttonText, { color: colors.text }]}>Got it</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        maxWidth: 320,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    subheader: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 4,
    },
    divider: {
        width: '100%',
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginBottom: 20,
    },
    body: {
        width: '100%',
        gap: 12,
        marginBottom: 30,
    },
    bulletRow: {
        flexDirection: 'row',
        gap: 10,
    },
    bullet: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.3)',
        lineHeight: 22,
    },
    bulletText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 22,
        flex: 1,
    },
    button: {
        width: '100%',
        height: 50,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});
