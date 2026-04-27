import React from 'react';
import Svg, { Polyline } from 'react-native-svg';

const W = 56;
const H = 18;
const PAD = 1.5;

interface SparklineProps {
    values: number[];
    color?: string;
}

export function Sparkline({ values, color = 'rgba(255,255,255,0.85)' }: SparklineProps) {
    if (values.length < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(0.001, max - min);

    const points = values
        .map((v, i) => {
            const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
            const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <Polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
            />
        </Svg>
    );
}
