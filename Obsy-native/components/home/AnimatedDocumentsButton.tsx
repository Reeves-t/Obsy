import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from 'react-native-svg';
import { CTAOrbShell } from '@/components/home/CTAOrbShell';

interface AnimatedDocumentsButtonProps {
    size?: number;
    disabled?: boolean;
    onPress?: () => void;
    dim?: boolean;
}

const DEFAULT_SIZE = 44;

function SilverDocumentsGlyph({ size }: { size: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Defs>
                {/* Page chrome */}
                <LinearGradient id="docChrome" x1="50%" y1="0%" x2="50%" y2="100%">
                    <Stop offset="0%" stopColor="#f0f0f2" />
                    <Stop offset="14%" stopColor="#d4d4d7" />
                    <Stop offset="46%" stopColor="#6a6a6e" />
                    <Stop offset="62%" stopColor="#3b3b3f" />
                    <Stop offset="86%" stopColor="#aaaaad" />
                    <Stop offset="100%" stopColor="#7d7d80" />
                </LinearGradient>

                {/* Behind-page chrome (slightly darker, peeks out) */}
                <LinearGradient id="docBackChrome" x1="50%" y1="0%" x2="50%" y2="100%">
                    <Stop offset="0%" stopColor="#9a9a9d" />
                    <Stop offset="50%" stopColor="#4d4d50" />
                    <Stop offset="100%" stopColor="#27272a" />
                </LinearGradient>

                {/* Folded corner triangle — slightly brighter */}
                <LinearGradient id="docFold" x1="50%" y1="0%" x2="50%" y2="100%">
                    <Stop offset="0%" stopColor="#dadade" />
                    <Stop offset="100%" stopColor="#85858a" />
                </LinearGradient>
            </Defs>

            {/* Behind page — offset for stacked-document feel */}
            <Rect
                x={5.6}
                y={4.2}
                width={12}
                height={15.6}
                rx={1.2}
                fill="url(#docBackChrome)"
            />

            {/* Foreground page with folded top-right corner */}
            <Path
                d="M5 3.4
                   L13.6 3.4
                   L18 7.8
                   L18 19
                   Q18 20 17 20
                   L5 20
                   Q4 20 4 19
                   L4 4.4
                   Q4 3.4 5 3.4 Z"
                fill="url(#docChrome)"
            />

            {/* Folded corner */}
            <Path
                d="M13.6 3.4
                   L18 7.8
                   L14.6 7.8
                   Q13.6 7.8 13.6 6.8
                   L13.6 3.4 Z"
                fill="url(#docFold)"
            />

            {/* Highlight along top of page */}
            <Rect x={4.5} y={3.7} width={9} height={0.7} rx={0.3} fill="#ffffff" opacity={0.45} />

            {/* Text lines */}
            <Path
                d="M6.5 10.5 L15.5 10.5
                   M6.5 13   L15.5 13
                   M6.5 15.5 L12.5 15.5"
                stroke="#2c2c30"
                strokeWidth={0.8}
                strokeLinecap="round"
                opacity={0.7}
            />
        </Svg>
    );
}

export function AnimatedDocumentsButton({
    size = DEFAULT_SIZE,
    disabled = false,
    onPress,
    dim = false,
}: AnimatedDocumentsButtonProps) {
    const glyphSize = size * 0.62;

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            disabled={disabled}
            onPress={onPress}
            style={styles.wrap}
        >
            <CTAOrbShell size={size} dim={dim}>
                <View style={styles.glyphWrap}>
                    <SilverDocumentsGlyph size={glyphSize} />
                </View>
            </CTAOrbShell>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    glyphWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
