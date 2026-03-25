import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
    Ellipse,
    Defs,
    LinearGradient,
    Stop,
} from 'react-native-svg';

const ORBS = [
    { cx: 564, cy: 527, rx: 58, ry: 57, color1: '#5A0C8A', color2: '#871E13' },
    { cx: 493, cy: 631, rx: 32, ry: 26, color1: '#5A0C8A', color2: '#076403' },
    { cx: 436, cy: 483, rx: 23, ry: 23, color1: '#5A0C8A', color2: '#871E13' },
];

interface ObsyIconProps {
    size?: number;
}

export function ObsyIcon({ size = 44 }: ObsyIconProps) {
    const S = size / 1024;

    return (
        <View style={[styles.wrapper, { width: size, height: size }]}>
            <Svg width={size} height={size} viewBox="0 0 1024 1024">
                <Defs>
                    <LinearGradient id="obsyRing" x1="511.5" y1="213" x2="511.5" y2="810" gradientUnits="userSpaceOnUse">
                        <Stop offset="0.038" stopColor="#868080" />
                        <Stop offset="0.221" stopColor="#434040" />
                        <Stop offset="0.346" stopColor="#2E2C2C" />
                        <Stop offset="0.538" stopColor="#121111" />
                        <Stop offset="0.889" stopColor="#A9A2A2" />
                    </LinearGradient>
                    <LinearGradient id="obsyFill" x1="511.5" y1="241" x2="511.5" y2="782" gradientUnits="userSpaceOnUse">
                        <Stop offset="0" stopColor="#000000" />
                        <Stop offset="0.538" stopColor="#222121" />
                        <Stop offset="1" stopColor="#060606" />
                    </LinearGradient>
                    {ORBS.map((orb, i) => (
                        <LinearGradient
                            key={`og${i}`}
                            id={`obsyOrb${i}`}
                            x1="0" y1="0"
                            x2={String(orb.rx * 2 * S + 4)}
                            y2={String(orb.ry * 2 * S + 4)}
                            gradientUnits="userSpaceOnUse"
                        >
                            <Stop offset="0" stopColor={orb.color1} />
                            <Stop offset="1" stopColor={orb.color2} />
                        </LinearGradient>
                    ))}
                </Defs>
                {/* Outer metallic ring */}
                <Ellipse cx={511.5} cy={511.5} rx={308.5} ry={298.5} fill="url(#obsyRing)" />
                {/* Inner dark fill */}
                <Ellipse cx={511.5} cy={511.5} rx={279.578} ry={270.071} fill="url(#obsyFill)" />
                {/* Orbs */}
                {ORBS.map((orb, i) => (
                    <Ellipse
                        key={i}
                        cx={orb.cx}
                        cy={orb.cy}
                        rx={orb.rx}
                        ry={orb.ry}
                        fill={`url(#obsyOrb${i})`}
                    />
                ))}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {},
});
