import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface SelectionTrailProps {
    points: Array<{ x: number; y: number }>;
}

/**
 * Renders a glowing SVG trail following the user's finger during drag-select mode.
 * Rendered as an absolute overlay with pointerEvents="none".
 */
export function SelectionTrail({ points }: SelectionTrailProps) {
    if (points.length < 2) return null;

    const pts = points.slice(-60);
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`;
    }

    return (
        <View style={styles.container} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill}>
                {/* Outer glow */}
                <Path
                    d={d}
                    stroke="rgba(168, 85, 247, 0.12)"
                    strokeWidth={14}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* Inner trail */}
                <Path
                    d={d}
                    stroke="rgba(168, 85, 247, 0.5)"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
    },
});
