import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { SparkleCluster } from './SparkleCluster';
import { MoodWeight } from '@/hooks/useWeeklyMoodAggregation';
import { getWeekRangeForUser } from '@/lib/dateUtils';
import { getISOWeek, getYear } from 'date-fns';
import { useObsyTheme } from '@/contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OrbPosition {
    x: number;
    y: number;
}

/**
 * Seeded random number generator (for consistent positioning per week)
 */
function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Generate a week-based seed for consistent randomness
 */
function getWeekSeed(): number {
    const { start } = getWeekRangeForUser(new Date());
    const weekNumber = getISOWeek(start);
    const year = getYear(start);
    return year * 100 + weekNumber; // e.g., 202606 for week 6 of 2026
}

/**
 * Calculate safe peripheral zones (avoids center focus areas)
 *
 * Safe zones are the outer edges of the screen:
 * - Top 25% (avoiding time/date)
 * - Bottom 25% (avoiding camera button)
 * - Left/Right edges (avoiding center content)
 */
function generateSafeZonePosition(seed: number, index: number, orbSize: number): OrbPosition {
    const baseSeed = seed + index * 1000;
    const random1 = seededRandom(baseSeed);
    const random2 = seededRandom(baseSeed + 1);

    const padding = orbSize / 2 + 20; // Keep orbs fully on screen with padding

    // Determine which safe zone to use (top, bottom, left, or right edge)
    const zoneChoice = seededRandom(baseSeed + 2);

    if (zoneChoice < 0.25) {
        // Top zone (top 25% of screen, left/right edges)
        return {
            x: random1 * (SCREEN_WIDTH - padding * 2) + padding,
            y: random2 * (SCREEN_HEIGHT * 0.25 - padding * 2) + padding,
        };
    } else if (zoneChoice < 0.5) {
        // Bottom zone (bottom 25% of screen, left/right edges)
        return {
            x: random1 * (SCREEN_WIDTH - padding * 2) + padding,
            y: SCREEN_HEIGHT * 0.75 + random2 * (SCREEN_HEIGHT * 0.25 - padding * 2),
        };
    } else if (zoneChoice < 0.75) {
        // Left edge (left 20% of screen, avoiding top/bottom corners)
        return {
            x: random1 * (SCREEN_WIDTH * 0.2 - padding * 2) + padding,
            y: SCREEN_HEIGHT * 0.25 + random2 * (SCREEN_HEIGHT * 0.5),
        };
    } else {
        // Right edge (right 20% of screen, avoiding top/bottom corners)
        return {
            x: SCREEN_WIDTH * 0.8 + random1 * (SCREEN_WIDTH * 0.2 - padding * 2),
            y: SCREEN_HEIGHT * 0.25 + random2 * (SCREEN_HEIGHT * 0.5),
        };
    }
}

interface AmbientMoodFieldProps {
    moodWeights: MoodWeight[];
    isPaused: boolean;
}

/**
 * AmbientMoodField - Week-level ambient visualization
 *
 * Displays 2-4 soft, breathing orbs in peripheral screen areas
 * based on weekly mood data. Orbs are seeded for consistent
 * positioning throughout the week.
 */
export function AmbientMoodField({ moodWeights, isPaused }: AmbientMoodFieldProps) {
    const { isLight } = useObsyTheme();
    const weekSeed = useMemo(() => getWeekSeed(), []);
    const [positionCycle, setPositionCycle] = useState(0);

    // Cycle through new positions every 10 seconds (allows full sparkle starburst to play out)
    useEffect(() => {
        if (isPaused) return;

        const CYCLE_DURATION = 4000;
        const interval = setInterval(() => {
            setPositionCycle((prev) => prev + 1);
        }, CYCLE_DURATION);

        return () => clearInterval(interval);
    }, [isPaused]);

    // Generate positions for sparkles (changes each cycle for randomness)
    const orbPositions = useMemo(() => {
        return moodWeights.map((mood, index) => {
            const sparkleSize = 32 * mood.size; // Cluster size
            // Use positionCycle to get different positions each cycle
            const seed = weekSeed + index + (positionCycle * 1000);
            return {
                ...mood,
                position: generateSafeZonePosition(seed, index, sparkleSize),
                delay: index * 600, // Stagger between clusters
            };
        });
    }, [moodWeights, weekSeed, positionCycle]);

    // No moods = no orbs
    if (orbPositions.length === 0) {
        return null;
    }

    return (
        <View style={styles.container} pointerEvents="none">
            {orbPositions.map((orb, index) => (
                <SparkleCluster
                    key={`${orb.moodId}-${positionCycle}-${index}`}
                    color={orb.color}
                    sizeFactor={orb.size}
                    x={orb.position.x}
                    y={orb.position.y}
                    delay={orb.delay}
                    isPaused={isPaused}
                    isLight={isLight}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0, // Behind all other content
    },
});
