import React from 'react';
import { SparkleCluster } from './SparkleCluster';

interface MoodOrbProps {
    color: string;
    size: number; // Size multiplier (1.0 = base, 1.5 = 1.5x, etc.)
    x: number; // Absolute x position
    y: number; // Absolute y position
    delay: number; // Initial delay before starting animation (ms)
    isPaused: boolean; // Pause animation when true
}

/**
 * MoodOrb - An animated sparkle cluster for the Ambient Mood Field
 *
 * Renders a group of 4-pointed star sparkles that animate independently
 * with scale, opacity, and rotation — creating a magic starburst effect.
 *
 * Each cluster's sparkles fade in/out at staggered intervals so the
 * overall effect is a continuous twinkling shimmer in the mood's color.
 */
export function MoodOrb({ color, size, x, y, delay, isPaused }: MoodOrbProps) {
    return (
        <SparkleCluster
            color={color}
            sizeFactor={size}
            x={x}
            y={y}
            delay={delay}
            isPaused={isPaused}
        />
    );
}
