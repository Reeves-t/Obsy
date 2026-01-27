import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, ActivityIndicator, Share } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import Colors from '@/constants/Colors';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { fetchArchives } from '@/services/archive';
import { ArchiveInsight } from '@/types/insights';

interface ExportInsightsModalProps {
    visible: boolean;
    onClose: () => void;
    userId: string;
}

export const ExportInsightsModal: React.FC<ExportInsightsModalProps> = ({
    visible,
    onClose,
    userId,
}) => {
    const [loading, setLoading] = useState(false);

    const handleExport = async (format: 'text' | 'json') => {
        setLoading(true);
        try {
            const archives = await fetchArchives(userId);
            let content = '';

            if (format === 'json') {
                content = JSON.stringify(archives, null, 2);
            } else {
                content = archives.map(a => (
                    `Title: ${a.title}\n` +
                    `Date: ${a.date_scope}\n` +
                    `Summary: ${a.summary}\n` +
                    `Content: ${a.body}\n` +
                    `---`
                )).join('\n\n');
            }

            await Share.share({
                message: content,
                title: `Obsy Insights Export (${new Date().toLocaleDateString()})`,
            });
            onClose();
        } catch (error) {
            console.error("Export failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={onClose}
                    style={styles.dismissArea}
                />
                <View style={styles.content}>
                    <View style={styles.dragBar} />
                    <View style={styles.header}>
                        <ThemedText type="subtitle" style={styles.title}>Export Insights</ThemedText>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                    </View>

                    <ThemedText style={styles.body}>
                        Choose a format to export all your saved insights.
                    </ThemedText>

                    {loading ? (
                        <ActivityIndicator color="#FFF" style={{ marginVertical: 20 }} />
                    ) : (
                        <View style={styles.options}>
                            <TouchableOpacity style={styles.option} onPress={() => handleExport('text')}>
                                <View style={styles.optionLeft}>
                                    <Ionicons name="document-text-outline" size={24} color="#FFF" />
                                    <ThemedText style={styles.optionText}>Plain Text (.txt)</ThemedText>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.option} onPress={() => handleExport('json')}>
                                <View style={styles.optionLeft}>
                                    <Ionicons name="code-slash-outline" size={24} color="#FFF" />
                                    <ThemedText style={styles.optionText}>Data Export (.json)</ThemedText>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    dismissArea: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        backgroundColor: '#1A1A1A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        gap: 16,
    },
    dragBar: {
        width: 36,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        color: '#FFFFFF',
    },
    body: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 8,
    },
    options: {
        gap: 12,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 16,
        borderRadius: 16,
    },
    optionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    optionText: {
        fontSize: 16,
        color: '#FFFFFF',
    },
});
