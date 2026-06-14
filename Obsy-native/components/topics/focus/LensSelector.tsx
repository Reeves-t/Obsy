import React from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOPIC_LENSES, type TopicLensId } from '@/lib/topicLens';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

interface LensSelectorProps {
    visible: boolean;
    currentLensId: TopicLensId;
    onClose: () => void;
    onSelectLens: (lensId: TopicLensId) => void;
}

/**
 * Lets the user change a topic's lens. Mirrors the ToneSelector pattern so the
 * two settings feel like siblings. Changing the lens shapes future generations.
 */
export function LensSelector({ visible, currentLensId, onClose, onSelectLens }: LensSelectorProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <AmbientBackground />
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={styles.container}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Topic Lens</Text>
                            <Text style={styles.description}>
                                How Obsy understands and reflects on this topic.
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {TOPIC_LENSES.map((lens) => {
                            const isSelected = lens.id === currentLensId;
                            return (
                                <TouchableOpacity
                                    key={lens.id}
                                    onPress={() => onSelectLens(lens.id)}
                                    activeOpacity={0.8}
                                    style={[styles.item, isSelected && styles.itemActive]}
                                >
                                    <View style={styles.itemInfo}>
                                        <Text style={[styles.itemLabel, isSelected && styles.itemLabelActive]}>
                                            {lens.label}
                                        </Text>
                                        <Text style={styles.itemDesc} numberOfLines={1}>
                                            {lens.description}
                                        </Text>
                                    </View>
                                    {isSelected && <Ionicons name="checkmark-sharp" size={22} color="#FFF" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    container: {
        width: '92%',
        maxWidth: 420,
        maxHeight: '80%',
        backgroundColor: 'rgba(12,14,22,0.55)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
    },
    description: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        marginTop: 4,
    },
    closeButton: {
        padding: 4,
        marginTop: -4,
        marginRight: -4,
    },
    list: {
        maxHeight: 460,
    },
    listContent: {
        padding: 16,
        paddingTop: 4,
        gap: 8,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        minHeight: 56,
    },
    itemActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.3)',
    },
    itemInfo: {
        flex: 1,
        gap: 3,
    },
    itemLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
    },
    itemLabelActive: {
        color: '#FFF',
    },
    itemDesc: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
});
