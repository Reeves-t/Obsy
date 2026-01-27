import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';

interface ToneTriggerButtonProps {
    activeToneName?: string;
    onPress: () => void;
}

export function ToneTriggerButton({ activeToneName, onPress }: ToneTriggerButtonProps) {
    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <View style={styles.content}>
                <ThemedText style={styles.text}>
                    Tone{activeToneName ? ` • ${activeToneName}` : ''}
                </ThemedText>
                <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" style={styles.icon} />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        height: 30,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    text: {
        fontSize: 12,
        fontFamily: 'Inter',
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.8)',
    },
    icon: {
        marginTop: 1,
    },
});
