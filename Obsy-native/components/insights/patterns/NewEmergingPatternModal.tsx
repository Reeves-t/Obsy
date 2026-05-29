import React, { useEffect } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getPatternTokens, CATEGORY_META } from './tokens';
import type { PatternTheme } from '@/types/patternKeywords';

interface NewEmergingPatternModalProps {
    visible: boolean;
    theme: PatternTheme | null;
    onClose: () => void;
}

export const NewEmergingPatternModal: React.FC<NewEmergingPatternModalProps> = ({ visible, theme, onClose }) => {
    const { isLight, colors } = useObsyTheme();
    const tokens = getPatternTokens(isLight);
    const meta = CATEGORY_META.emerging;

    useEffect(() => {
        if (!visible) return;
        const t = setTimeout(onClose, 5000);
        return () => clearTimeout(t);
    }, [visible, onClose]);

    if (!theme) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable
                    style={[
                        styles.card,
                        { backgroundColor: colors.background, borderColor: tokens.line },
                    ]}
                    onPress={(e) => e.stopPropagation()}
                >
                    <View style={styles.headerRow}>
                        <View style={[styles.dot, { backgroundColor: meta.color }]} />
                        <ThemedText style={[styles.headerLabel, { color: tokens.ink3 }]}>NEW EMERGING PATTERN</ThemedText>
                    </View>

                    <ThemedText style={[styles.name, { color: tokens.ink }]}>{theme.name}</ThemedText>
                    <ThemedText style={[styles.reflection, { color: tokens.ink2 }]}>{theme.reflection}</ThemedText>

                    <TouchableOpacity
                        onPress={onClose}
                        activeOpacity={0.8}
                        style={[styles.cta, { borderColor: tokens.line }]}
                    >
                        <ThemedText style={[styles.ctaText, { color: tokens.ink2 }]}>Got it</ThemedText>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    card: {
        borderRadius: 22,
        padding: 22,
        borderWidth: 1,
        width: '100%',
        maxWidth: 340,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
        elevation: 12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    dot: { width: 7, height: 7, borderRadius: 99 },
    headerLabel: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: '500' },
    name: { fontSize: 24, lineHeight: 28, letterSpacing: -0.4, fontWeight: '500', marginBottom: 8 },
    reflection: { fontSize: 14.5, lineHeight: 20, fontStyle: 'italic', marginBottom: 18 },
    cta: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
    ctaText: { fontSize: 13, fontWeight: '500' },
});
