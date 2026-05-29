import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getPatternTokens } from './tokens';

interface TrendGraphProps {
    values: number[];
    color: string;
    width?: number;
    height?: number;
}

export const TrendGraph: React.FC<TrendGraphProps> = ({ values, color, width = 322, height = 92 }) => {
    const { isLight, colors } = useObsyTheme();
    const tokens = getPatternTokens(isLight);
    const pad = 6;

    const { path, area, lastX, lastY } = useMemo(() => {
        if (values.length === 0) return { path: '', area: '', lastX: 0, lastY: 0 };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(1, max - min);
        const xs = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
        const ys = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2 - 4);

        const pts = values.map((v, i) => [xs(i), ys(v)] as [number, number]);
        let d = `M ${pts[0][0]} ${pts[0][1]}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;
            const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
            const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
            const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
            const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
        }

        const lastIdx = values.length - 1;
        const areaPath = `${d} L ${xs(lastIdx)} ${height - pad} L ${xs(0)} ${height - pad} Z`;
        return { path: d, area: areaPath, lastX: xs(lastIdx), lastY: ys(values[lastIdx]) };
    }, [values, width, height]);

    if (!path) return null;

    const gradId = `trend-grad-${color.replace('#', '')}`;

    return (
        <View>
            <Svg width={width} height={height}>
                <Defs>
                    <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={color} stopOpacity={0.22} />
                        <Stop offset="100%" stopColor={color} stopOpacity={0} />
                    </LinearGradient>
                </Defs>

                {[0, 0.5, 1].map((p) => {
                    const y = pad + p * (height - pad * 2 - 4);
                    return (
                        <Line
                            key={p}
                            x1={pad}
                            x2={width - pad}
                            y1={y}
                            y2={y}
                            stroke={tokens.line}
                            strokeDasharray="2,4"
                            strokeWidth={1}
                            opacity={0.6}
                        />
                    );
                })}

                <Path d={area} fill={`url(#${gradId})`} />
                <Path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <Circle cx={lastX} cy={lastY} r={3.5} fill={colors.background} stroke={color} strokeWidth={1.5} />
            </Svg>
        </View>
    );
};
