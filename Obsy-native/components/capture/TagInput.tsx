import React, { useState, useMemo } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ThemedText } from '@/components/ui/ThemedText';
import Colors from '@/constants/Colors';
import { GlassCard } from '@/components/ui/GlassCard';

interface TagInputProps {
    existingTags: string[];
    selectedTags: string[];
    onTagsChange: (tags: string[]) => void;
}

export function TagInput({ existingTags, selectedTags, onTagsChange }: TagInputProps) {
    const [modalVisible, setModalVisible] = useState(false);
    const [searchText, setSearchText] = useState('');

    const filteredTags = useMemo(() => {
        const lowerSearch = searchText.toLowerCase();
        return existingTags.filter(t => t.toLowerCase().includes(lowerSearch));
    }, [existingTags, searchText]);

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            onTagsChange(selectedTags.filter(t => t !== tag));
        } else {
            onTagsChange([...selectedTags, tag]);
        }
    };

    const createTag = () => {
        const newTag = searchText.trim();
        if (newTag && !selectedTags.includes(newTag)) {
            onTagsChange([...selectedTags, newTag]);
            setSearchText('');
        }
    };

    return (
        <View>
            <View style={styles.chipsContainer}>
                <TouchableOpacity
                    style={styles.addTagButton}
                    onPress={() => setModalVisible(true)}
                >
                    <Ionicons name="add" size={16} color={Colors.obsy.silver} />
                    <ThemedText style={styles.addTagText}>Add Tag</ThemedText>
                </TouchableOpacity>

                {selectedTags.map(tag => (
                    <TouchableOpacity
                        key={tag}
                        style={styles.tagChip}
                        onPress={() => setModalVisible(true)}
                    >
                        <ThemedText style={styles.tagText}>#{tag}</ThemedText>
                    </TouchableOpacity>
                ))}
            </View>

            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <BlurView intensity={95} tint="dark" style={styles.modalContainer}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardAvoid}
                    >
                        <View style={styles.modalHeader}>
                            <ThemedText type="subtitle">Manage Tags</ThemedText>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color={Colors.obsy.silver} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search or create tag..."
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                value={searchText}
                                onChangeText={setSearchText}
                                autoFocus
                            />
                        </View>

                        <ScrollView style={styles.tagList} contentContainerStyle={styles.tagListContent}>
                            {/* Create Option */}
                            {searchText.length > 0 && !existingTags.includes(searchText) && (
                                <TouchableOpacity style={styles.createOption} onPress={createTag}>
                                    <View style={styles.createIcon}>
                                        <Ionicons name="add" size={16} color="black" />
                                    </View>
                                    <ThemedText style={styles.createText}>Create tag "{searchText}"</ThemedText>
                                </TouchableOpacity>
                            )}

                            {/* Existing Tags */}
                            <View style={styles.tagsGrid}>
                                {filteredTags.map(tag => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <TouchableOpacity
                                            key={tag}
                                            style={[styles.modalTagChip, isSelected && styles.modalTagChipSelected]}
                                            onPress={() => toggleTag(tag)}
                                        >
                                            <ThemedText style={[styles.modalTagText, isSelected && styles.modalTagTextSelected]}>
                                                #{tag}
                                            </ThemedText>
                                            {isSelected && <Ionicons name="checkmark" size={14} color="black" />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {existingTags.length === 0 && !searchText && (
                                <View style={styles.emptyState}>
                                    <ThemedText style={styles.emptyText}>No tags yet. Start typing to create one.</ThemedText>
                                </View>
                            )}
                        </ScrollView>
                    </KeyboardAvoidingView>
                </BlurView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
    },
    addTagButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    addTagText: {
        fontSize: 12,
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
    tagChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    tagText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
    },
    modalContainer: {
        flex: 1,
        paddingTop: 60,
    },
    keyboardAvoid: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    searchContainer: {
        marginHorizontal: 20,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: 48,
        color: 'white',
        fontSize: 16,
    },
    tagList: {
        flex: 1,
    },
    tagListContent: {
        padding: 20,
    },
    createOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        marginBottom: 20,
    },
    createIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.obsy.silver,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createText: {
        color: Colors.obsy.silver,
        fontSize: 16,
        fontWeight: '600',
    },
    tagsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    modalTagChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    modalTagChipSelected: {
        backgroundColor: Colors.obsy.silver,
        borderColor: Colors.obsy.silver,
    },
    modalTagText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    modalTagTextSelected: {
        color: 'black',
        fontWeight: '600',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
    },
});
