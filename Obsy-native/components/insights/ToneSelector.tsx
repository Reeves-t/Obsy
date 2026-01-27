import React from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, ScrollView, Text, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { AI_TONES, AiToneId } from '@/lib/aiTone';
import { useSubscription } from '@/hooks/useSubscription';
import { PremiumGate } from '@/components/PremiumGate';
import { useCustomTones } from '@/hooks/useCustomTones';
import { CustomToneModal } from './CustomToneModal';
import { CustomTone } from '@/lib/customTone';


interface ToneSelectorProps {
    visible: boolean;
    onClose: () => void;
    currentToneId: AiToneId;
    onSelectTone: (toneId: AiToneId) => void;
}

export function ToneSelector({ visible, onClose, currentToneId, onSelectTone }: ToneSelectorProps) {
    const { checkLimit, tier } = useSubscription();
    const { tones, addTone, editTone, removeTone } = useCustomTones();
    const [editingTone, setEditingTone] = React.useState<CustomTone | null>(null);
    const [modalVisible, setModalVisible] = React.useState(false);

    const handleAddCustom = () => {
        setEditingTone(null);
        setModalVisible(true);
    };

    const handleEditCustom = (tone: CustomTone) => {
        setEditingTone(tone);
        setModalVisible(true);
    };

    const handleSaveCustom = async (name: string, prompt: string) => {
        if (editingTone) {
            await editTone(editingTone.id, name, prompt);
        } else {
            const newTone = await addTone(name, prompt);
            if (newTone) {
                onSelectTone(newTone.id);
            }
        }
    };

    const handleDeleteCustom = async () => {
        if (editingTone) {
            await removeTone(editingTone.id);
            setModalVisible(false);
            if (currentToneId === editingTone.id) {
                onSelectTone('neutral');
            }
        }
    };


    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={styles.container}>
                    <View style={styles.header}>
                        <View>
                            <ThemedText style={styles.title}>Select Tone</ThemedText>
                            <ThemedText style={styles.description}>
                                Choose the personality for your insight.
                            </ThemedText>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                        {AI_TONES.map((tone) => {
                            const isSelected = tone.id === currentToneId;
                            const isPlus = tone.id !== 'neutral';
                            const hasAccess = !isPlus || checkLimit('premium_tones');

                            const Content = (
                                <View
                                    style={[
                                        styles.toneItem,
                                        isSelected && styles.toneItemActive,
                                        !hasAccess && styles.toneItemLocked
                                    ]}
                                >
                                    <View style={styles.toneInfo}>
                                        <View style={styles.labelRow}>
                                            <Text style={[
                                                styles.toneLabel,
                                                isSelected && styles.toneLabelActive,
                                                !hasAccess && styles.toneLabelLocked
                                            ]}>
                                                {tone.label}
                                            </Text>

                                            {!hasAccess && (
                                                <View style={styles.plusPill}>
                                                    <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.6)" />
                                                    <Text style={styles.plusPillText}>Plus</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.toneDesc, isSelected && styles.toneDescActive]} numberOfLines={1}>
                                            {tone.shortDescription}
                                        </Text>
                                    </View>

                                    {isSelected && (
                                        <Ionicons name="checkmark-sharp" size={22} color="#FFF" />
                                    )}
                                </View>
                            );

                            if (isPlus) {
                                return (
                                    <PremiumGate
                                        key={tone.id}
                                        featureName="premium_tones"
                                        guestAction="paywall"
                                        onAction={() => onSelectTone(tone.id)}
                                    >
                                        {Content}
                                    </PremiumGate>
                                );
                            }

                            return (
                                <TouchableOpacity
                                    key={tone.id}
                                    onPress={() => onSelectTone(tone.id)}
                                    activeOpacity={0.8}
                                >
                                    {Content}
                                </TouchableOpacity>
                            );
                        })}

                        <View style={styles.sectionHeader}>
                            <ThemedText style={styles.sectionTitle}>CUSTOM TONES</ThemedText>
                            {!checkLimit('premium_tones') && (
                                <View style={[styles.plusPill, { marginLeft: 8, paddingVertical: 2 }]}>
                                    <Text style={[styles.plusPillText, { fontSize: 9 }]}>Plus</Text>
                                </View>
                            )}
                        </View>

                        {tones.map((tone) => {
                            const isSelected = tone.id === currentToneId;
                            return (
                                <View key={tone.id} style={styles.customToneRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.toneItem,
                                            styles.customToneItem,
                                            isSelected && styles.toneItemActive
                                        ]}
                                        onPress={() => onSelectTone(tone.id)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={styles.toneInfo}>
                                            <View style={styles.labelRow}>
                                                <Text style={[
                                                    styles.toneLabel,
                                                    isSelected && styles.toneLabelActive
                                                ]}>
                                                    {tone.name}
                                                </Text>
                                            </View>
                                            <Text style={[styles.toneDesc, isSelected && styles.toneDescActive]} numberOfLines={1}>
                                                {tone.prompt}
                                            </Text>
                                        </View>
                                        {isSelected && (
                                            <Ionicons name="checkmark-sharp" size={22} color="#FFF" />
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.editButton}
                                        onPress={() => handleEditCustom(tone)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.5)" />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}

                        <PremiumGate
                            featureName="premium_tones"
                            guestAction="paywall"
                            onAction={handleAddCustom}
                        >
                            <View style={styles.addButton}>
                                <Ionicons name="add" size={20} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.addButtonText}>Add Custom Tone</Text>
                            </View>
                        </PremiumGate>
                    </ScrollView>

                    <CustomToneModal
                        visible={modalVisible}
                        onClose={() => setModalVisible(false)}
                        onSave={handleSaveCustom}
                        onDelete={handleDeleteCustom}
                        initialTone={editingTone}
                    />
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
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    container: {
        width: '92%',
        maxWidth: 420,
        maxHeight: '80%',
        backgroundColor: '#0A0A0A',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        padding: 4,
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
        paddingBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
    },
    closeButton: {
        padding: 4,
        marginTop: -4,
        marginRight: -4,
    },
    description: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        marginTop: 4,
    },
    list: {
        maxHeight: 450,
    },
    listContent: {
        padding: 16,
        paddingTop: 0,
        gap: 8,
    },
    toneItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        minHeight: 56,
    },
    toneItemActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.3)',
    },
    toneInfo: {
        flex: 1,
        gap: 2,
    },
    toneLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        fontFamily: 'Inter',
    },
    toneLabelActive: {
        color: '#FFF',
    },
    toneDesc: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'Inter',
    },
    toneItemLocked: {
        opacity: 0.7,
    },
    toneLabelLocked: {
        color: 'rgba(255,255,255,0.6)',
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    plusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
    },
    plusPillText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '600',
        fontFamily: 'Inter',
    },
    sectionHeader: {
        marginTop: 16,
        marginBottom: 8,
        paddingHorizontal: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.2,
    },
    customToneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    customToneItem: {
        flex: 1,
    },
    editButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        marginTop: 8,
        gap: 8,
    },
    addButtonText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter',
    },
    toneDescActive: {
        color: 'rgba(255,255,255,0.7)',
    },
});

