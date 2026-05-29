import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getPatternTokens, CATEGORY_META } from './tokens';
import { TrendGraph } from './TrendGraph';
import { FlowBar } from './FlowBar';
import type { PatternCategory, PatternTheme, PatternShiftDirection } from '@/types/patternKeywords';

interface DetailCardProps {
    theme: PatternTheme;
    category: PatternCategory;
    width: number;
}

const ShiftArrow: React.FC<{ dir: PatternShiftDirection; color: string }> = ({ dir, color }) => {
    if (dir === 'flat') {
        return (
            <Svg width={11} height={11} viewBox="0 0 11 11">
                <Path d="M2 5.5h7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
            </Svg>
        );
    }
    const flip = dir === 'down';
    return (
        <Svg width={11} height={11} viewBox="0 0 11 11" style={{ transform: [{ rotate: flip ? '180deg' : '0deg' }] }}>
            <Path
                d="M2 8 L5.5 3.5 L9 8"
                stroke={color}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
};

const Header: React.FC<{ left: string; right: React.ReactNode; tokens: ReturnType<typeof getPatternTokens> }> = ({ left, right, tokens }) => (
    <View style={styles.headerRow}>
        <ThemedText style={[styles.headerLeft, { color: tokens.ink2 }]}>{left.toUpperCase()}</ThemedText>
        <View style={styles.headerRight}>{right}</View>
    </View>
);

export const DetailCard: React.FC<DetailCardProps> = ({ theme, category, width }) => {
    const { isLight } = useObsyTheme();
    const tokens = getPatternTokens(isLight);
    const meta = CATEGORY_META[category];

    const graphWidth = Math.max(200, width - 40);

    return (
        <View style={[styles.card, { backgroundColor: tokens.paper, borderColor: tokens.line }]}>
            <View style={styles.tag}>
                <View style={[styles.tagDot, { backgroundColor: meta.color }]} />
                <ThemedText style={[styles.tagLabel, { color: tokens.ink3 }]}>{meta.label.toUpperCase()}</ThemedText>
            </View>

            <ThemedText style={[styles.keywords, { color: tokens.ink3 }]} numberOfLines={2}>{theme.keywords}</ThemedText>
            <ThemedText style={[styles.name, { color: tokens.ink }]}>{theme.name}</ThemedText>
            <ThemedText style={[styles.reflection, { color: tokens.ink2 }]}>{theme.reflection}</ThemedText>

            <Header
                left="Emotional trend"
                tokens={tokens}
                right={
                    <View style={styles.shiftRow}>
                        <ShiftArrow dir={theme.shift.dir} color={meta.color} />
                        <ThemedText style={[styles.shiftLabel, { color: tokens.ink2 }]}>{theme.shift.label}</ThemedText>
                        <ThemedText style={[styles.shiftMeta, { color: tokens.ink4 }]}> · 12 wk</ThemedText>
                    </View>
                }
            />
            <View style={styles.graphWrap}>
                <TrendGraph values={theme.trend} color={meta.color} width={graphWidth} />
            </View>

            <View style={[styles.divider, { backgroundColor: tokens.lineSoft }]} />

            <Header
                left="Mood flow"
                tokens={tokens}
                right={
                    <ThemedText style={[styles.shiftMeta, { color: tokens.ink3 }]}>
                        {theme.mentions} mentions · {theme.span}
                    </ThemedText>
                }
            />
            <View style={styles.flowList}>
                {theme.flow.map((f, i) => (
                    <FlowBar
                        key={f.label + i}
                        label={f.label}
                        value={f.value}
                    />
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 22,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 20,
        borderWidth: 1,
    },
    tag: { position: 'absolute', top: 18, right: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    tagDot: { width: 6, height: 6, borderRadius: 99 },
    tagLabel: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: '500' },
    keywords: { fontSize: 11, letterSpacing: 0.4, marginBottom: 6, paddingRight: 100 },
    name: { fontSize: 32, lineHeight: 34, letterSpacing: -0.5, marginBottom: 14, fontWeight: '500' },
    reflection: { fontSize: 16, lineHeight: 22, fontStyle: 'italic', marginBottom: 22 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
    headerLeft: { fontSize: 11, letterSpacing: 0.5, fontWeight: '500' },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    shiftLabel: { fontSize: 11, letterSpacing: 0.2 },
    shiftMeta: { fontSize: 11, letterSpacing: 0.2 },
    graphWrap: { marginTop: 8, marginLeft: -4, marginBottom: 18 },
    divider: { height: 1, marginVertical: 6 },
    flowList: { marginTop: 12, gap: 9 },
});
