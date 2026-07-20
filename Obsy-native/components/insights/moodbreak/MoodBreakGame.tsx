import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ui/ThemedText';
import { Capture } from '@/types/capture';
import { AiToneId } from '@/lib/aiTone';
import { buildCaptureRows, CaptureRow, GamePhase } from './engine';
import { GameEngine } from './GameEngine';
import { ScoreHeader } from './effects';

const HIGH_SCORE_KEY = 'moodbreak_high_score';

interface MoodBreakGameProps {
    captures: Capture[];
    tone: AiToneId;
    isLight: boolean;
    onRefresh?: () => Promise<void>;
    /** When false (e.g. scrolled out of the viewport) a running game auto-pauses. */
    isVisible?: boolean;
}

export const MoodBreakGame = memo(function MoodBreakGame({
    captures,
    tone,
    isLight,
    onRefresh,
    isVisible = true,
}: MoodBreakGameProps) {
    const rows = useMemo(() => buildCaptureRows(captures), [captures]);

    // Track captures count to detect new captures and reset to Start
    const capturesCountRef = useRef(captures.length);
    const [gameKey, setGameKey] = useState(0);
    const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
    const [paused, setPaused] = useState(false);
    const [appActive, setAppActive] = useState(AppState.currentState === 'active');

    // Live score/combo (reported by the engine) and the persisted high score —
    // rendered in a header row above the canvas so bricks can never cover them.
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(1);
    const [comboPoints, setComboPoints] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const highScoreRef = useRef(0);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        AsyncStorage.getItem(HIGH_SCORE_KEY)
            .then(v => {
                const n = v ? parseInt(v, 10) : 0;
                if (!Number.isNaN(n) && n > highScoreRef.current) {
                    highScoreRef.current = n;
                    setHighScore(n);
                }
            })
            .catch(() => { /* non-critical */ });
        return () => {
            // Flush any pending high-score write on unmount
            if (persistTimerRef.current) {
                clearTimeout(persistTimerRef.current);
                AsyncStorage.setItem(HIGH_SCORE_KEY, String(highScoreRef.current)).catch(() => {});
            }
        };
    }, []);

    const handleStats = useCallback((s: number, c: number, cp: number) => {
        setScore(s);
        setCombo(c);
        setComboPoints(cp);
        if (s > highScoreRef.current) {
            highScoreRef.current = s;
            setHighScore(s);
            // Debounce writes — a hot streak beats the record on every break
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            persistTimerRef.current = setTimeout(() => {
                persistTimerRef.current = null;
                AsyncStorage.setItem(HIGH_SCORE_KEY, String(highScoreRef.current)).catch(() => {});
            }, 800);
        }
    }, []);

    useEffect(() => {
        const sub = AppState.addEventListener('change', s => setAppActive(s === 'active'));
        return () => sub.remove();
    }, []);

    // Auto-pause when the game scrolls off-screen or the app backgrounds.
    // Resume is manual only (tap the pause overlay).
    useEffect(() => {
        if (gamePhase === 'playing' && (!isVisible || !appActive)) {
            setPaused(true);
        }
    }, [gamePhase, isVisible, appActive]);

    useEffect(() => {
        if (gamePhase !== 'playing') setPaused(false);
    }, [gamePhase]);

    const handleResume = useCallback(() => {
        if (isVisible && appActive) setPaused(false);
    }, [isVisible, appActive]);

    // When captures change outside of our own refresh, reset game to idle with fresh bricks
    const isRefreshingRef = useRef(false);
    useEffect(() => {
        if (captures.length !== capturesCountRef.current) {
            capturesCountRef.current = captures.length;
            // Don't reset if we triggered the refresh ourselves (Start button)
            if (!isRefreshingRef.current) {
                setGameKey(k => k + 1);
                setGamePhase('idle');
            }
        }
    }, [captures.length]);

    const handleStart = useCallback(async () => {
        setGamePhase('loading');
        try {
            isRefreshingRef.current = true;
            if (onRefresh) await onRefresh();
        } catch { /* proceed even if refresh fails */ }
        isRefreshingRef.current = false;
        capturesCountRef.current = captures.length;
        setGamePhase('playing');
    }, [onRefresh, captures.length]);

    const handleReplay = useCallback(() => {
        setGameKey(k => k + 1);
        setGamePhase('idle');
    }, []);

    const handleCleared = useCallback(() => {
        setGamePhase('cleared');
    }, []);

    if (rows.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <ThemedText style={[styles.emptyText, { color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>
                    No captures yet this week.
                </ThemedText>
            </View>
        );
    }

    return (
        <View>
            <ScoreHeader score={score} combo={combo} comboPoints={comboPoints} best={highScore} isLight={isLight} />
            <GameCanvas
                key={gameKey}
                seed={gameKey}
                rows={rows}
                tone={tone}
                isLight={isLight}
                gamePhase={gamePhase}
                paused={paused}
                onStart={handleStart}
                onReplay={handleReplay}
                onCleared={handleCleared}
                onResume={handleResume}
                onStats={handleStats}
            />
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Game Canvas — measures the container, hosts the gesture root
// ─────────────────────────────────────────────────────────────────────────────

interface GameCanvasProps {
    rows: CaptureRow[];
    seed: number;
    tone: AiToneId;
    isLight: boolean;
    gamePhase: GamePhase;
    paused: boolean;
    onStart: () => void;
    onReplay: () => void;
    onCleared: () => void;
    onResume: () => void;
    onStats: (score: number, combo: number, comboPoints: number) => void;
}

function GameCanvas({
    rows,
    seed,
    tone,
    isLight,
    gamePhase,
    paused,
    onStart,
    onReplay,
    onCleared,
    onResume,
    onStats,
}: GameCanvasProps) {
    const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize({ width, height });
    }, []);

    return (
        <GestureHandlerRootView style={[styles.gameContainer, {
            backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
        }]} onLayout={onLayout}>
            {containerSize && (
                <GameEngine
                    width={containerSize.width}
                    height={containerSize.height}
                    rows={rows}
                    seed={seed}
                    tone={tone}
                    isLight={isLight}
                    gamePhase={gamePhase}
                    paused={paused}
                    onStart={onStart}
                    onReplay={onReplay}
                    onCleared={onCleared}
                    onResume={onResume}
                    onStats={onStats}
                />
            )}
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    gameContainer: {
        width: '100%',
        height: 300,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
    },
});
