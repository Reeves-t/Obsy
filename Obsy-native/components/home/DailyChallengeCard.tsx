import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { UserDailyChallenge, ChallengeTemplate } from '@/types/challenges';
import { GlassCard } from '@/components/ui/GlassCard';
import { ThemedText } from '@/components/ui/ThemedText';

interface DailyChallengeCardProps {
    daily: UserDailyChallenge;
    template: ChallengeTemplate;
}

export function DailyChallengeCard({ daily, template }: DailyChallengeCardProps) {
    const router = useRouter();
    const isCompleted = daily.status === 'completed';

    const handlePress = () => {
        if (isCompleted) return;

        // Navigate to capture with challenge context
        router.push({
            pathname: '/capture',
            params: {
                challengeId: daily.id,
                challengeTemplateId: template.id,
                challengeTitle: template.title,
            }
        });
    };

    return (
        <TouchableOpacity
            onPress={handlePress}
            disabled={isCompleted}
            activeOpacity={0.8}
        >
            <GlassCard style={[styles.card, isCompleted && styles.cardCompleted]} variant="liquid">
                <View style={styles.content}>
                    <ThemedText
                        style={[styles.prompt, isCompleted && styles.promptCompleted]}
                        numberOfLines={3}
                        ellipsizeMode="tail"
                    >
                        {template.prompt}
                    </ThemedText>

                    <View style={styles.iconWrapper}>
                        <View style={[styles.iconContainer, isCompleted ? styles.iconCompleted : styles.iconActive]}>
                            {isCompleted ? (
                                <Ionicons name="checkmark" size={20} color="rgba(255,255,255,0.75)" />
                            ) : (
                                <Ionicons name="camera-outline" size={20} color="rgba(255,255,255,0.85)" />
                            )}
                        </View>
                        {isCompleted && (
                            <ThemedText style={styles.completedText}>Completed</ThemedText>
                        )}
                    </View>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        width: 260, // Fixed width for carousel
        padding: 20,
        height: 160, // Fixed height for consistent landscape tiles
        marginRight: 4, // Small margin for shadow/glow
    },
    cardCompleted: {
        opacity: 0.6,
    },
    content: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
    },
    prompt: {
        fontSize: 16,
        lineHeight: 24,
        color: '#FFFFFF', // Pure White
        fontWeight: '500',
        flexWrap: 'wrap',
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        marginBottom: 12,
    },
    promptCompleted: {
        color: 'rgba(255,255,255,0.6)',
        textDecorationLine: 'line-through',
    },
    iconWrapper: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    completedText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
        textAlign: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    iconActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    iconCompleted: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
    },
});
