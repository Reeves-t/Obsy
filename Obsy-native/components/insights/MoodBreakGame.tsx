import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { StyleSheet, View, LayoutChangeEvent, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/ThemedText';
import { Capture } from '@/types/capture';
import { resolveMoodColorById, getMoodLabel } from '@/lib/moodUtils';
import { startOfWeek } from 'date-fns';
import { WEEK_STARTS_ON } from '@/lib/dateUtils';
import { AiToneId } from '@/lib/aiTone';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CaptureRow {
    moodId: string;
    mood: string;
    color: string;
    totalForMood: number;
}

interface Brick {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    mood: string;
    count: number;
    broken: boolean;
}

interface MoodBreakGameProps {
    captures: Capture[];
    tone: AiToneId;
    isLight: boolean;
    onRefresh?: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro Insight Generator
// ─────────────────────────────────────────────────────────────────────────────

function generateMicroInsight(mood: string, count: number, tone: AiToneId): string {
    const m = mood.toLowerCase();
    const M = mood.charAt(0).toUpperCase() + mood.slice(1).toLowerCase();

    switch (tone) {
        case 'gentle_roast':
            return pickRandom([
                `${count} ${m} check-in${count !== 1 ? 's' : ''}. You okay or just allergic to excitement?`,
                `${M} again? ${count} time${count !== 1 ? 's' : ''} this week. Bold strategy.`,
                `${count}x ${m}. At this point it's a lifestyle.`,
                `${M} popped up ${count} time${count !== 1 ? 's' : ''}. Noted, not judged.`,
            ]);
        case 'dry_humor':
            return pickRandom([
                `${M}, ${count} time${count !== 1 ? 's' : ''}. Consistent, at least.`,
                `${count}x ${m}. A pattern or a coincidence? Hard to say.`,
                `${M} showed up ${count} time${count !== 1 ? 's' : ''}. It knows where you live.`,
            ]);
        case 'cinematic':
            return pickRandom([
                `${M} lingered, then cracked.`,
                `A week scored by ${m}—${count} scene${count !== 1 ? 's' : ''} deep.`,
                `${M} entered the frame ${count} time${count !== 1 ? 's' : ''}. Fade out.`,
            ]);
        case 'dreamlike':
            return pickRandom([
                `${M} drifted through ${count} time${count !== 1 ? 's' : ''}…`,
                `Echoes of ${m}, soft and recurring.`,
                `${count} whisper${count !== 1 ? 's' : ''} of ${m} this week.`,
            ]);
        case 'mystery_noir':
            return pickRandom([
                `${M}. ${count} time${count !== 1 ? 's' : ''}. The usual suspect.`,
                `${count} trace${count !== 1 ? 's' : ''} of ${m}. The plot thickens.`,
                `${M} left ${count} mark${count !== 1 ? 's' : ''} on the week.`,
            ]);
        case 'stoic_calm':
            return pickRandom([
                `${M}. ${count}. Observed.`,
                `${count}x ${m}. It is what it is.`,
                `${M}, noted ${count} time${count !== 1 ? 's' : ''}.`,
            ]);
        case 'romantic':
            return pickRandom([
                `${M} found you ${count} time${count !== 1 ? 's' : ''} this week.`,
                `${count} tender moment${count !== 1 ? 's' : ''} of ${m}.`,
                `${M} kept returning—${count} time${count !== 1 ? 's' : ''}.`,
            ]);
        case 'inspiring':
            return pickRandom([
                `${M} showed up ${count} time${count !== 1 ? 's' : ''}. Every feeling is a step forward.`,
                `${count}x ${m}. Even this is movement.`,
                `${M}, ${count} time${count !== 1 ? 's' : ''}. You noticed. That matters.`,
            ]);
        case 'neutral':
        default:
            return pickRandom([
                `${M} showed up ${count} time${count !== 1 ? 's' : ''} this week.`,
                `${count}x ${m}.`,
                `${M}: ${count} capture${count !== 1 ? 's' : ''} this week.`,
            ]);
    }
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics constants
// ─────────────────────────────────────────────────────────────────────────────

const BALL_RADIUS = 5;
const PADDLE_HEIGHT = 10;
const PADDLE_WIDTH = 70;
const BRICK_PADDING = 2;
const BRICKS_PER_ROW = 10;
const MAX_ROWS = 14;
const BALL_SPEED = 2.2;
const BRICK_ZONE_RATIO = 0.45; // Top 45% of container reserved for bricks

// ─────────────────────────────────────────────────────────────────────────────
// Build rows: one row per capture, grouped/sorted by mood
// ─────────────────────────────────────────────────────────────────────────────

function buildCaptureRows(captures: Capture[]): CaptureRow[] {
    const now = new Date();
    const cutoff = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
    const filtered = captures.filter(c => c.mood_id && new Date(c.created_at) >= cutoff);

    // Count totals per mood for insight text
    const moodCounts: Record<string, number> = {};
    filtered.forEach(c => {
        moodCounts[c.mood_id!] = (moodCounts[c.mood_id!] || 0) + 1;
    });

    // Sort by mood_id so same moods group together as layers
    const sorted = [...filtered].sort((a, b) => {
        if (a.mood_id! < b.mood_id!) return -1;
        if (a.mood_id! > b.mood_id!) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return sorted.slice(0, MAX_ROWS).map(c => {
        const label = c.mood_name_snapshot || getMoodLabel(c.mood_id!);
        return {
            moodId: c.mood_id!,
            mood: label,
            color: resolveMoodColorById(c.mood_id!, label),
            totalForMood: moodCounts[c.mood_id!] || 1,
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Build bricks from rows
// ─────────────────────────────────────────────────────────────────────────────

function buildBricks(rows: CaptureRow[], containerWidth: number, containerHeight: number): Brick[] {
    const bricks: Brick[] = [];
    const topPadding = 8;
    const sidePadding = 8;
    const availableWidth = containerWidth - sidePadding * 2;

    // Dynamically size rows to fit in the top portion of the container
    const brickZoneHeight = containerHeight * BRICK_ZONE_RATIO;
    const totalVerticalPadding = (rows.length - 1) * BRICK_PADDING;
    const brickH = Math.max(8, Math.floor((brickZoneHeight - topPadding - totalVerticalPadding) / rows.length));

    rows.forEach((row, rowIdx) => {
        const totalHPadding = (BRICKS_PER_ROW - 1) * BRICK_PADDING;
        const brickW = (availableWidth - totalHPadding) / BRICKS_PER_ROW;

        for (let col = 0; col < BRICKS_PER_ROW; col++) {
            bricks.push({
                id: `${row.moodId}-${rowIdx}-${col}`,
                x: sidePadding + col * (brickW + BRICK_PADDING),
                y: topPadding + rowIdx * (brickH + BRICK_PADDING),
                width: brickW,
                height: brickH,
                color: row.color,
                mood: row.mood,
                count: row.totalForMood,
                broken: false,
            });
        }
    });

    return bricks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const MoodBreakGame = memo(function MoodBreakGame({ captures, tone, isLight, onRefresh }: MoodBreakGameProps) {
    const rows = useMemo(() => buildCaptureRows(captures), [captures]);

    // Track captures count to detect new captures and reset to Start
    const capturesCountRef = useRef(captures.length);
    const [gameKey, setGameKey] = useState(0);
    const [gamePhase, setGamePhase] = useState<'idle' | 'loading' | 'playing' | 'cleared'>('idle');

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
        <GameCanvas
            key={gameKey}
            rows={rows}
            tone={tone}
            isLight={isLight}
            gamePhase={gamePhase}
            onStart={handleStart}
            onReplay={handleReplay}
            onCleared={handleCleared}
        />
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Game Canvas
// ─────────────────────────────────────────────────────────────────────────────

interface GameCanvasProps {
    rows: CaptureRow[];
    tone: AiToneId;
    isLight: boolean;
    gamePhase: 'idle' | 'loading' | 'playing' | 'cleared';
    onStart: () => void;
    onReplay: () => void;
    onCleared: () => void;
}

function GameCanvas({ rows, tone, isLight, gamePhase, onStart, onReplay, onCleared }: GameCanvasProps) {
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
                    tone={tone}
                    isLight={isLight}
                    gamePhase={gamePhase}
                    onStart={onStart}
                    onReplay={onReplay}
                    onCleared={onCleared}
                />
            )}
        </GestureHandlerRootView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Engine
// ─────────────────────────────────────────────────────────────────────────────

interface GameEngineProps {
    width: number;
    height: number;
    rows: CaptureRow[];
    tone: AiToneId;
    isLight: boolean;
    gamePhase: 'idle' | 'loading' | 'playing' | 'cleared';
    onStart: () => void;
    onReplay: () => void;
    onCleared: () => void;
}

function GameEngine({ width, height, rows, tone, isLight, gamePhase, onStart, onReplay, onCleared }: GameEngineProps) {
    const initialBricks = useMemo(() => buildBricks(rows, width, height), [rows, width, height]);

    const [bricks, setBricks] = useState<Brick[]>(initialBricks);
    const [ballRender, setBallRender] = useState({ x: width / 2, y: height - 50 });
    const [paddleRenderX, setPaddleRenderX] = useState(width / 2 - PADDLE_WIDTH / 2);
    const [microInsight, setMicroInsight] = useState<string | null>(null);
    const insightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Physics refs (mutable, not rendered directly)
    const ballPos = useRef({ x: width / 2, y: height - 50 });
    const ballVel = useRef({ x: BALL_SPEED * 0.7, y: -BALL_SPEED });
    const paddleXRef = useRef(width / 2 - PADDLE_WIDTH / 2);
    const bricksRef = useRef<Brick[]>(initialBricks);
    const gameActiveRef = useRef(false);

    // Sync bricks when rows change
    useEffect(() => {
        const newBricks = buildBricks(rows, width, height);
        bricksRef.current = newBricks;
        setBricks(newBricks);
        ballPos.current = { x: width / 2, y: height - 50 };
        ballVel.current = { x: BALL_SPEED * 0.7, y: -BALL_SPEED };
        setBallRender({ x: width / 2, y: height - 50 });
        paddleXRef.current = width / 2 - PADDLE_WIDTH / 2;
        setPaddleRenderX(width / 2 - PADDLE_WIDTH / 2);
    }, [rows, width]);

    // Paddle gesture — updates ref + render state
    const paddleGesture = Gesture.Pan()
        .onUpdate((e) => {
            if (!gameActiveRef.current) return;
            const newX = Math.max(0, Math.min(width - PADDLE_WIDTH, e.absoluteX - PADDLE_WIDTH / 2));
            paddleXRef.current = newX;
        })
        .runOnJS(true);

    // Brick hit handler
    const onBrickHit = useCallback((brickId: string) => {
        const brick = bricksRef.current.find(b => b.id === brickId);
        if (!brick || brick.broken) return;

        brick.broken = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        setBricks(prev => prev.map(b =>
            b.id === brickId ? { ...b, broken: true } : b
        ));

        const insight = generateMicroInsight(brick.mood, brick.count, tone);
        setMicroInsight(insight);
        if (insightTimer.current) clearTimeout(insightTimer.current);
        insightTimer.current = setTimeout(() => setMicroInsight(null), 1500);

        const remaining = bricksRef.current.filter(b => !b.broken).length;
        if (remaining === 0) {
            gameActiveRef.current = false;
            onCleared();
        }
    }, [tone, onCleared]);

    // Game loop — only runs when gamePhase is 'playing'
    useEffect(() => {
        if (gamePhase !== 'playing') return;

        // Reset ball position at game start
        ballPos.current = { x: width / 2, y: height - 50 };
        ballVel.current = { x: BALL_SPEED * 0.7, y: -BALL_SPEED };
        gameActiveRef.current = true;

        const interval = setInterval(() => {
            if (!gameActiveRef.current) return;

            const ball = ballPos.current;
            const vel = ballVel.current;
            const pX = paddleXRef.current;
            const paddleY = height - PADDLE_HEIGHT - 16;

            ball.x += vel.x;
            ball.y += vel.y;

            // Wall collisions
            if (ball.x - BALL_RADIUS <= 0) {
                ball.x = BALL_RADIUS;
                vel.x = Math.abs(vel.x);
            }
            if (ball.x + BALL_RADIUS >= width) {
                ball.x = width - BALL_RADIUS;
                vel.x = -Math.abs(vel.x);
            }
            if (ball.y - BALL_RADIUS <= 0) {
                ball.y = BALL_RADIUS;
                vel.y = Math.abs(vel.y);
            }

            // Bottom — forgiving reset
            if (ball.y + BALL_RADIUS >= height) {
                ball.y = height - 50;
                ball.x = width / 2;
                vel.x = BALL_SPEED * (Math.random() > 0.5 ? 0.7 : -0.7);
                vel.y = -BALL_SPEED;
            }

            // Paddle collision
            if (
                ball.y + BALL_RADIUS >= paddleY &&
                ball.y + BALL_RADIUS <= paddleY + PADDLE_HEIGHT + 4 &&
                ball.x >= pX &&
                ball.x <= pX + PADDLE_WIDTH &&
                vel.y > 0
            ) {
                vel.y = -Math.abs(vel.y);
                const hitPos = (ball.x - pX) / PADDLE_WIDTH;
                vel.x = BALL_SPEED * (hitPos - 0.5) * 2;
                ball.y = paddleY - BALL_RADIUS;
            }

            // Brick collisions
            for (const brick of bricksRef.current) {
                if (brick.broken) continue;

                if (
                    ball.x + BALL_RADIUS > brick.x &&
                    ball.x - BALL_RADIUS < brick.x + brick.width &&
                    ball.y + BALL_RADIUS > brick.y &&
                    ball.y - BALL_RADIUS < brick.y + brick.height
                ) {
                    const overlapLeft = (ball.x + BALL_RADIUS) - brick.x;
                    const overlapRight = (brick.x + brick.width) - (ball.x - BALL_RADIUS);
                    const overlapTop = (ball.y + BALL_RADIUS) - brick.y;
                    const overlapBottom = (brick.y + brick.height) - (ball.y - BALL_RADIUS);
                    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

                    if (minOverlap === overlapTop || minOverlap === overlapBottom) {
                        vel.y = -vel.y;
                    } else {
                        vel.x = -vel.x;
                    }

                    onBrickHit(brick.id);
                    break;
                }
            }

            // Update render state for ball and paddle
            setBallRender({ x: ball.x, y: ball.y });
            setPaddleRenderX(pX);
        }, 16);

        return () => {
            clearInterval(interval);
            gameActiveRef.current = false;
            if (insightTimer.current) clearTimeout(insightTimer.current);
        };
    }, [gamePhase, width, height, onBrickHit]);

    // Theme-aware colors
    const ballColor = isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    const ballShadow = isLight ? '#000' : '#fff';
    const paddleBg = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';
    const paddleBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
    const brickBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
    const overlayTextColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)';
    const subtleTextColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';
    const buttonBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    const buttonBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';

    const isPlaying = gamePhase === 'playing';

    return (
        <GestureDetector gesture={paddleGesture}>
            <View style={[styles.canvas, { width, height }]}>
                {/* Bricks — always visible */}
                {bricks.map(brick => (
                    <View
                        key={brick.id}
                        style={[
                            styles.brick,
                            {
                                left: brick.x,
                                top: brick.y,
                                width: brick.width,
                                height: brick.height,
                                backgroundColor: brick.color,
                                opacity: brick.broken ? 0 : 0.85,
                                transform: [{ scale: brick.broken ? 0.3 : 1 }],
                                shadowColor: brick.color,
                                borderColor: brickBorder,
                            },
                        ]}
                    />
                ))}

                {/* Ball — only when playing */}
                {isPlaying && (
                    <View style={[styles.ball, {
                        left: ballRender.x - BALL_RADIUS,
                        top: ballRender.y - BALL_RADIUS,
                        backgroundColor: ballColor,
                        shadowColor: ballShadow,
                    }]} />
                )}

                {/* Paddle — only when playing */}
                {isPlaying && (
                    <View
                        style={[
                            styles.paddle,
                            {
                                left: paddleRenderX,
                                top: height - PADDLE_HEIGHT - 16,
                                backgroundColor: paddleBg,
                                borderColor: paddleBorder,
                            },
                        ]}
                    />
                )}

                {/* Micro insight overlay — during play */}
                {microInsight && isPlaying && (
                    <View style={[styles.insightOverlay, { top: height - 48 }]}>
                        <ThemedText style={[styles.insightText, { color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)' }]} numberOfLines={2}>
                            {microInsight}
                        </ThemedText>
                    </View>
                )}

                {/* IDLE — Start overlay */}
                {(gamePhase === 'idle' || gamePhase === 'loading') && (
                    <View style={styles.overlayCenter}>
                        <TouchableOpacity
                            style={[styles.startButton, { borderColor: buttonBorder, backgroundColor: buttonBg }]}
                            onPress={onStart}
                            activeOpacity={0.7}
                            disabled={gamePhase === 'loading'}
                        >
                            <ThemedText style={[styles.startButtonText, { color: overlayTextColor }]}>
                                {gamePhase === 'loading' ? 'Loading...' : 'Start'}
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                )}

                {/* CLEARED — All bricks broken */}
                {gamePhase === 'cleared' && (
                    <View style={styles.overlayCenter}>
                        <ThemedText style={[styles.clearedText, { color: overlayTextColor }]}>
                            Week cleared
                        </ThemedText>
                        <TouchableOpacity
                            style={[styles.replayButton, { borderColor: buttonBorder, backgroundColor: buttonBg }]}
                            onPress={onReplay}
                            activeOpacity={0.7}
                        >
                            <ThemedText style={[styles.replayButtonText, { color: subtleTextColor }]}>
                                Play again
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </GestureDetector>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

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
    canvas: {
        position: 'relative',
    },
    brick: {
        position: 'absolute',
        borderRadius: 4,
        borderWidth: 0.5,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 3,
    },
    ball: {
        position: 'absolute',
        width: BALL_RADIUS * 2,
        height: BALL_RADIUS * 2,
        borderRadius: BALL_RADIUS,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 4,
    },
    paddle: {
        position: 'absolute',
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        borderRadius: PADDLE_HEIGHT / 2,
        borderWidth: 0.5,
    },
    insightOverlay: {
        position: 'absolute',
        left: 12,
        right: 12,
        alignItems: 'center',
    },
    insightText: {
        fontSize: 12,
        textAlign: 'center',
        fontStyle: 'italic',
        letterSpacing: 0.3,
    },
    overlayCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    startButton: {
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
    },
    startButtonText: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    clearedText: {
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    replayButton: {
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    replayButtonText: {
        fontSize: 13,
        letterSpacing: 0.5,
    },
});
