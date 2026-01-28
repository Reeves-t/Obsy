import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface ArchiveStorageIndicatorProps {
    current: number;
    max: number;
}

export const ArchiveStorageIndicator: React.FC<ArchiveStorageIndicatorProps> = ({ current, max }) => {
    const { colors } = useObsyTheme();
    const percentage = Math.min(current / max, 1);
    const isNearFull = current >= 130;

    return (
        <View style={styles.container}>
            <View style={[styles.progressBarBg, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <View
                    style={[
                        styles.progressBarFill,
                        {
                            width: `${percentage * 100}%`,
                            backgroundColor: 'rgba(255,255,255,0.8)',
                        },
                        isNearFull && {
                            backgroundColor: 'rgba(255,255,255,1)',
                            shadowColor: '#FFF',
                        }
                    ]}
                />
            </View>
            <ThemedText style={[styles.text, { color: colors.cardTextSecondary }]}>
                {current} / {max} <ThemedText style={[styles.subtext, { color: colors.cardTextSecondary }]}>saved</ThemedText>
            </ThemedText>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    progressBarBg: {
        height: 6,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 3,
    },
    nearFullFill: {
        backgroundColor: 'rgba(255,255,255,1)', // More intense but not red
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    text: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    subtext: {
        color: 'rgba(255,255,255,0.3)',
    }
});
