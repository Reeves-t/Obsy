import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { ChevronDown } from 'lucide-react-native';
import { useMoodverseStore } from '@/lib/moodverseStore';

export function TimeNavigator() {
    const { selectedYear, setSelectedYear } = useMoodverseStore();
    const currentYear = new Date().getFullYear();

    const cycleYear = () => {
        const nextYear = selectedYear <= currentYear - 3 ? currentYear : selectedYear - 1;
        setSelectedYear(nextYear);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.yearPill} onPress={cycleYear}>
                <ThemedText style={styles.yearText}>{selectedYear}</ThemedText>
                <ChevronDown size={14} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    yearPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    yearText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
});
