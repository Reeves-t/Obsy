import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
    cancelAnimation,
    Easing,
    interpolateColor,
    useAnimatedProps,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import type { WeekdayMoodShapeData } from '@/lib/weekdayMoodShape';

export const CHART_HEIGHT = 260;
const PAD_X = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
const BASELINE_Y = CHART_HEIGHT - PAD_BOTTOM;

// Every weekday shape is resampled to a fixed grid so shapes with different
// month-bucket counts can morph into each other.
const SAMPLES = 24;
// Fixed pool of stacked layer slots; layers are ordered by count, so anything
// past the pool would be a sliver at the top of the stack.
const MAX_LAYERS = 12;
const BOUNDARY_COUNT = MAX_LAYERS + 1;
const TOTAL_VALUES = BOUNDARY_COUNT * SAMPLES;

const MORPH_DURATION = 650;
const BREATH_DURATION = 5200;
const BREATH_AMP = 2;
const SWELL_LIFT = 2.5;
const FALLBACK_COLOR = '#888888';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const GRID_RATIOS = [0.25, 0.5, 0.75];

interface SampledShape {
    boundaries: number[];
    layerCount: number;
    colors: string[];
    moodIds: (string | null)[];
}

function smoothPathWorklet(xs: number[], ys: number[], move: boolean): string {
    'worklet';
    const n = xs.length;
    if (n === 0) return '';
    if (n === 1) {
        return `${move ? 'M' : 'L'}${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    }

    let d = `${move ? 'M' : 'L'}${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i += 1) {
        const i0 = i > 0 ? i - 1 : i;
        const i3 = i + 2 < n ? i + 2 : i + 1;
        const cp1x = xs[i] + (xs[i + 1] - xs[i0]) / 6;
        const cp1y = ys[i] + (ys[i + 1] - ys[i0]) / 6;
        const cp2x = xs[i + 1] - (xs[i3] - xs[i]) / 6;
        const cp2y = ys[i + 1] - (ys[i3] - ys[i]) / 6;
        d += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
    }
    return d;
}

function areaPathWorklet(xs: number[], topYs: number[], bottomYs: number[]): string {
    'worklet';
    const n = xs.length;
    const rxs: number[] = [];
    const rys: number[] = [];
    for (let i = n - 1; i >= 0; i -= 1) {
        rxs.push(xs[i]);
        rys.push(bottomYs[i]);
    }
    return `${smoothPathWorklet(xs, topYs, true)} ${smoothPathWorklet(rxs, rys, false)} Z`;
}

// Breathing offset is a pure function of the boundary's y value, so the two
// layers sharing a boundary stay glued, collapsed layers stay closed, and the
// amplitude fades to zero at the baseline (empty months don't wobble).
function breathOffset(y: number, i: number, phase: number, env: number): number {
    'worklet';
    const depth = Math.min(1, Math.max(0, (BASELINE_Y - y) / 24));
    return BREATH_AMP * depth * Math.sin(phase + i * 0.55 + y * 0.045) * env;
}

// Evaluates the Catmull-Rom smoothed curve through uniformly spaced values at
// `samples` uniform parameter positions (same control-point math as smoothPathWorklet).
function resampleSmooth(ys: number[], samples: number): number[] {
    const n = ys.length;
    const out = new Array<number>(samples);
    if (n === 1) {
        out.fill(ys[0]);
        return out;
    }
    for (let s = 0; s < samples; s += 1) {
        const t = (s / (samples - 1)) * (n - 1);
        const i = Math.min(Math.floor(t), n - 2);
        const u = t - i;
        const p0 = ys[i - 1] ?? ys[i];
        const p1 = ys[i];
        const p2 = ys[i + 1];
        const p3 = ys[i + 2] ?? p2;
        const cp1 = p1 + (p2 - p0) / 6;
        const cp2 = p2 - (p3 - p1) / 6;
        const w = 1 - u;
        out[s] = w * w * w * p1 + 3 * w * w * u * cp1 + 3 * w * u * u * cp2 + u * u * u * p2;
    }
    return out;
}

function sampleBoundaries(data: WeekdayMoodShapeData, chartWidth: number): SampledShape {
    const plotWidth = chartWidth - PAD_X * 2;
    const maxTotal = Math.max(1, ...data.buckets.map((bucket) => bucket.totalCaptures));
    const yFor = (value: number) => PAD_TOP + (1 - value / maxTotal) * PLOT_HEIGHT;

    const layers = data.layers.slice(0, MAX_LAYERS);
    const layerCount = layers.length;
    const count = data.buckets.length;

    const boundaries = new Array<number>(TOTAL_VALUES).fill(BASELINE_Y);
    const colors = Array.from({ length: MAX_LAYERS }, (_, k) => layers[k]?.color ?? FALLBACK_COLOR);
    const moodIds = Array.from({ length: MAX_LAYERS }, (_, k) => layers[k]?.moodId ?? null);

    if (count === 0 || layerCount === 0) {
        return { boundaries, layerCount: 0, colors, moodIds };
    }

    if (count === 1) {
        // Single month: a smooth centered bump standing in for the old 32px bar.
        const cx = chartWidth / 2;
        let running = 0;
        const cumY: number[] = [BASELINE_Y];
        layers.forEach((layer) => {
            running += layer.values[0];
            cumY.push(yFor(running));
        });
        for (let b = 1; b < BOUNDARY_COUNT; b += 1) {
            const y = cumY[Math.min(b, layerCount)];
            for (let s = 0; s < SAMPLES; s += 1) {
                const x = PAD_X + (s / (SAMPLES - 1)) * plotWidth;
                boundaries[b * SAMPLES + s] = Math.abs(x - cx) <= 16 ? y : BASELINE_Y;
            }
        }
        return { boundaries, layerCount, colors, moodIds };
    }

    const cumulative = new Array<number>(count).fill(0);
    const boundaryYs: number[][] = [];
    layers.forEach((layer) => {
        for (let i = 0; i < count; i += 1) {
            cumulative[i] += layer.values[i];
        }
        boundaryYs.push(cumulative.map(yFor));
    });

    const sampledTop = resampleSmooth(boundaryYs[layerCount - 1], SAMPLES);
    for (let b = 1; b < BOUNDARY_COUNT; b += 1) {
        const sampled = b <= layerCount ? (b === layerCount ? sampledTop : resampleSmooth(boundaryYs[b - 1], SAMPLES)) : sampledTop;
        for (let s = 0; s < SAMPLES; s += 1) {
            boundaries[b * SAMPLES + s] = sampled[s];
        }
    }

    return { boundaries, layerCount, colors, moodIds };
}

interface ShapeLayerSlotProps {
    slot: number;
    xs: number[];
    fromB: SharedValue<number[]>;
    toB: SharedValue<number[]>;
    progress: SharedValue<number>;
    breathPhase: SharedValue<number>;
    fromColor: string;
    toColor: string;
    strokeColor: string;
    selected: boolean;
    dimmed: boolean;
    onPress: (event: any) => void;
}

const ShapeLayerSlot = memo(function ShapeLayerSlot({
    slot,
    xs,
    fromB,
    toB,
    progress,
    breathPhase,
    fromColor,
    toColor,
    strokeColor,
    selected,
    dimmed,
    onPress,
}: ShapeLayerSlotProps) {
    const dim = useSharedValue(0);
    const swell = useSharedValue(0);

    useEffect(() => {
        dim.value = withTiming(dimmed ? 1 : 0, { duration: 220 });
        swell.value = selected
            ? withSpring(1, { damping: 14, stiffness: 180 })
            : withTiming(0, { duration: 180 });
    }, [selected, dimmed, dim, swell]);

    const animatedProps = useAnimatedProps(() => {
        const p = progress.value;
        const phase = breathPhase.value;
        const sw = swell.value;
        const from = fromB.value;
        const to = toB.value;
        const n = xs.length;
        const topOffset = (slot + 1) * n;
        const bottomOffset = slot * n;

        const top = new Array<number>(n);
        const bottom = new Array<number>(n);
        for (let i = 0; i < n; i += 1) {
            const env = Math.sin((Math.PI * i) / (n - 1));
            const ti = topOffset + i;
            const bi = bottomOffset + i;
            const topBase = from[ti] + (to[ti] - from[ti]) * p;
            const bottomBase = from[bi] + (to[bi] - from[bi]) * p;
            // Swell fades out where the layer is thin so empty months stay flat.
            const swellAmt = sw * SWELL_LIFT * env * Math.min(1, Math.max(0, (bottomBase - topBase) / 12));

            let topY = topBase + breathOffset(topBase, i, phase, env) - swellAmt;
            let bottomY = slot === 0
                ? bottomBase
                : bottomBase + breathOffset(bottomBase, i, phase, env) + swellAmt;
            if (topY > BASELINE_Y) topY = BASELINE_Y;
            if (bottomY > BASELINE_Y) bottomY = BASELINE_Y;
            top[i] = topY;
            bottom[i] = bottomY;
        }

        return {
            d: areaPathWorklet(xs, top, bottom),
            fill: interpolateColor(p, [0, 1], [fromColor, toColor]),
            fillOpacity: 0.94 - dim.value * 0.76,
            stroke: strokeColor,
            strokeOpacity: sw,
            strokeWidth: 1.5 * sw,
        };
    }, [slot, xs, fromColor, toColor, strokeColor]);

    return <AnimatedPath animatedProps={animatedProps} onPress={onPress} />;
});

export interface WeekdayShapeChartProps {
    shapeData: WeekdayMoodShapeData;
    chartWidth: number;
    isLight: boolean;
    selectedMoodId: string | null;
    selectedMoodLabel: string | null;
    onSelectMood: (moodId: string | null) => void;
}

export const WeekdayShapeChart = memo(function WeekdayShapeChart({
    shapeData,
    chartWidth: requestedWidth,
    isLight,
    selectedMoodId,
    selectedMoodLabel,
    onSelectMood,
}: WeekdayShapeChartProps) {
    const chartWidth = Math.max(280, requestedWidth);
    const isFocused = useIsFocused();

    const xs = useMemo(() => {
        const plotWidth = chartWidth - PAD_X * 2;
        return Array.from({ length: SAMPLES }, (_, i) => PAD_X + (i / (SAMPLES - 1)) * plotWidth);
    }, [chartWidth]);

    const progress = useSharedValue(1);
    const breathPhase = useSharedValue(0);
    const fromB = useSharedValue<number[]>(new Array<number>(TOTAL_VALUES).fill(BASELINE_Y));
    const toB = useSharedValue<number[]>(new Array<number>(TOTAL_VALUES).fill(BASELINE_Y));

    const fromRef = useRef<number[]>(new Array<number>(TOTAL_VALUES).fill(BASELINE_Y));
    const toRef = useRef<number[]>(new Array<number>(TOTAL_VALUES).fill(BASELINE_Y));
    const toColorsRef = useRef<string[]>(new Array<string>(MAX_LAYERS).fill(FALLBACK_COLOR));
    const prevLayerCountRef = useRef(0);
    const firstRunRef = useRef(true);

    const [fromColors, setFromColors] = useState<string[]>(() => new Array<string>(MAX_LAYERS).fill(FALLBACK_COLOR));
    const [toColors, setToColors] = useState<string[]>(() => new Array<string>(MAX_LAYERS).fill(FALLBACK_COLOR));
    const [slotMoodIds, setSlotMoodIds] = useState<(string | null)[]>(() => new Array(MAX_LAYERS).fill(null));
    const [activeSlots, setActiveSlots] = useState(0);

    useEffect(() => {
        const next = sampleBoundaries(shapeData, chartWidth);
        const p = Math.min(1, Math.max(0, progress.value));

        // Snapshot the currently displayed shape so mid-morph retargets stay continuous.
        const current = fromRef.current.map((value, i) => value + (toRef.current[i] - value) * p);
        // Start each morph's color crossfade from the previous target color (the shade the
        // slot was already heading toward). Colors only cross-fade on the UI thread.
        const startColors = firstRunRef.current ? next.colors.slice() : toColorsRef.current.slice();
        // Exiting slots keep their current color while they collapse to invisible.
        const nextColors = next.colors.map((color, k) => (k < next.layerCount ? color : startColors[k]));

        fromRef.current = current;
        toRef.current = next.boundaries;
        toColorsRef.current = nextColors;
        firstRunRef.current = false;

        fromB.value = current;
        toB.value = next.boundaries;
        setFromColors(startColors);
        setToColors(nextColors);
        setSlotMoodIds(next.moodIds);
        setActiveSlots(Math.max(prevLayerCountRef.current, next.layerCount));
        prevLayerCountRef.current = next.layerCount;

        progress.value = 0;
        progress.value = withTiming(1, { duration: MORPH_DURATION, easing: Easing.out(Easing.cubic) });
    }, [shapeData, chartWidth, progress, fromB, toB]);

    useEffect(() => {
        if (!isFocused) {
            cancelAnimation(breathPhase);
            return;
        }
        breathPhase.value = 0;
        breathPhase.value = withRepeat(
            withTiming(Math.PI * 2, { duration: BREATH_DURATION, easing: Easing.linear }),
            -1,
            false
        );
        return () => cancelAnimation(breathPhase);
    }, [isFocused, breathPhase]);

    useEffect(() => () => {
        cancelAnimation(progress);
        cancelAnimation(breathPhase);
    }, [progress, breathPhase]);

    const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    const baselineColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.14)';
    const labelColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
    const strokeColor = isLight ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.36)';

    return (
        <Svg
            width={chartWidth}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            onPress={() => onSelectMood(null)}
        >
            {GRID_RATIOS.map((ratio, index) => (
                <Line
                    key={`grid-${index}`}
                    x1={PAD_X}
                    x2={chartWidth - PAD_X}
                    y1={PAD_TOP + ratio * PLOT_HEIGHT}
                    y2={PAD_TOP + ratio * PLOT_HEIGHT}
                    stroke={gridColor}
                    strokeWidth={1}
                />
            ))}
            {Array.from({ length: activeSlots }, (_, k) => (
                <ShapeLayerSlot
                    key={`slot-${k}`}
                    slot={k}
                    xs={xs}
                    fromB={fromB}
                    toB={toB}
                    progress={progress}
                    breathPhase={breathPhase}
                    fromColor={fromColors[k] ?? FALLBACK_COLOR}
                    toColor={toColors[k] ?? FALLBACK_COLOR}
                    strokeColor={strokeColor}
                    selected={slotMoodIds[k] != null && slotMoodIds[k] === selectedMoodId}
                    dimmed={selectedMoodId != null && slotMoodIds[k] !== selectedMoodId}
                    onPress={(event) => {
                        event?.stopPropagation?.();
                        const moodId = slotMoodIds[k];
                        if (moodId) onSelectMood(moodId);
                    }}
                />
            ))}
            <Line
                x1={PAD_X}
                x2={chartWidth - PAD_X}
                y1={BASELINE_Y}
                y2={BASELINE_Y}
                stroke={baselineColor}
                strokeWidth={1}
            />
            {shapeData.buckets.length > 0 ? (
                <>
                    <SvgText
                        x={PAD_X}
                        y={CHART_HEIGHT - 10}
                        fill={labelColor}
                        fontSize={10}
                        fontWeight="600"
                    >
                        {shapeData.buckets[0].label}
                    </SvgText>
                    <SvgText
                        x={chartWidth - PAD_X}
                        y={CHART_HEIGHT - 10}
                        fill={labelColor}
                        fontSize={10}
                        fontWeight="600"
                        textAnchor="end"
                    >
                        {shapeData.buckets[shapeData.buckets.length - 1].label}
                    </SvgText>
                    {selectedMoodLabel ? (
                        <SvgText
                            x={chartWidth / 2}
                            y={CHART_HEIGHT - 10}
                            fill={isLight ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.74)'}
                            fontSize={11}
                            fontWeight="800"
                            textAnchor="middle"
                        >
                            {selectedMoodLabel}
                        </SvgText>
                    ) : null}
                </>
            ) : null}
        </Svg>
    );
});
