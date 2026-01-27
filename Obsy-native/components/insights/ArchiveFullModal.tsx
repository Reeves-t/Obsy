import React from 'react';
import { StyleSheet, View, TouchableOpacity, Modal } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import Colors from '@/constants/Colors';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

interface ArchiveFullModalProps {
    visible: boolean;
    onClose: () => void;
    onManageArchive: () => void;
    onExportInsights: () => void;
    onUnlockPremium: () => void;
}

export const ArchiveFullModal: React.FC<ArchiveFullModalProps> = ({
    visible,
    onClose,
    onManageArchive,
    onExportInsights,
    onUnlockPremium,
}) => {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={onClose}
                    style={styles.dismissArea}
                />
                <View style={styles.content}>
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="archive-outline" size={32} color="#FFFFFF" />
                        </View>
                        <ThemedText type="title" style={styles.title}>Archive Full</ThemedText>
                    </View>

                    <ThemedText style={styles.body}>
                        You've saved 150 insights.{"\n"}
                        Obsy keeps archives intentional by design.
                    </ThemedText>

                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.primaryBtn} onPress={onManageArchive}>
                            <ThemedText style={styles.primaryBtnText}>Manage Archive</ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={onExportInsights}>
                            <ThemedText style={styles.secondaryBtnText}>Export Insights</ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.premiumBtn} onPress={onUnlockPremium}>
                            <ThemedText style={styles.premiumBtnText}>Unlock with Obsy Plus</ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 40,
    },
    dismissArea: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        width: '100%',
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderRadius: 24,
        padding: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        gap: 20,
    },
    header: {
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        color: '#FFFFFF',
    },
    body: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 24,
    },
    actions: {
        width: '100%',
        gap: 12,
        marginTop: 10,
    },
    primaryBtn: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#000000',
        fontWeight: '600',
        fontSize: 16,
    },
    secondaryBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    secondaryBtnText: {
        color: '#FFFFFF',
        fontWeight: '500',
        fontSize: 16,
    },
    premiumBtn: {
        paddingVertical: 10,
        alignItems: 'center',
    },
    premiumBtnText: {
        color: Colors.obsy.silver,
        fontSize: 14,
        fontWeight: '600',
    },
});
