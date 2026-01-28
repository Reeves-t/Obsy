import React from 'react';
import { StyleSheet, View, ScrollView, Dimensions } from 'react-native';
import { Capture } from '@/lib/captureStore';
import { TodayCaptureCard } from './TodayCaptureCard';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface TodayCollectionStackProps {
    captures: Capture[];
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85; // Wider card for peeking effect
const SPACING = 12;
const SNAP_INTERVAL = CARD_WIDTH + SPACING;
const INSET = (width - CARD_WIDTH) / 2;

export function TodayCollectionStack({ captures }: TodayCollectionStackProps) {
    const { colors } = useObsyTheme();

    if (captures.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>No captures yet today.</ThemedText>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingHorizontal: INSET - SPACING / 2 }]}
                snapToInterval={SNAP_INTERVAL}
                decelerationRate="fast"
                pagingEnabled={false}
                snapToAlignment="center"
            >
                {captures.map((capture, index) => (
                    <View key={capture.id} style={styles.cardContainer}>
                        <TodayCaptureCard
                            capture={capture}
                            onPress={() => {
                                // TODO: Navigate to capture details
                                console.log('Pressed capture:', capture.id);
                            }}
                        />
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 500, // Taller for content
    },
    scrollContent: {
        alignItems: 'center',
        gap: SPACING,
    },
    cardContainer: {
        width: CARD_WIDTH,
    },
    emptyContainer: {
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
    },
});
