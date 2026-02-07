import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { DailyChallengeCard } from './DailyChallengeCard';
import { useDailyChallenges } from '@/lib/challengeStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface DailyChallengesSectionProps {
    listWrapper?: (children: React.ReactNode) => React.ReactNode;
}

export function DailyChallengesSection({ listWrapper }: DailyChallengesSectionProps) {
    const { user } = useAuth();
    const { dailyChallenges } = useDailyChallenges(user?.id ?? null);
    const { colors } = useObsyTheme();

    if (!dailyChallenges.length) return null;

    const cards = dailyChallenges.map(({ daily, template }) => (
        <DailyChallengeCard
            key={daily.id}
            daily={daily}
            template={template}
        />
    ));

    const cardRow = (
        <View style={[styles.listRow, styles.listPadding]}>
            {cards}
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="defaultSemiBold" style={[styles.title, { color: colors.text }]}>Daily Challenges</ThemedText>
                <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>Optional captures for today</ThemedText>
            </View>

            {listWrapper ? (
                listWrapper(cardRow)
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.listRow, styles.listPadding]}
                >
                    {cards}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    title: {
        fontSize: 18,
        color: 'white',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    listRow: {
        flexDirection: 'row',
        gap: 12, // Gap between cards
    },
    listPadding: {
        paddingHorizontal: 20,
        paddingRight: 40, // Extra padding at end
    },
});
