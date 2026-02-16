import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { StyleSheet, View, Dimensions, LayoutChangeEvent } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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

interface WeeklyMoodStat {
    mood: string;
    count: number;
    percent: number;
    color: string;
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
    opacity: number;
    scale: number;
}

interface MoodBreakGameProps {
    captures: Capture[];
    tone: AiToneId;
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
const BRICK_PADDING = 3;
const BRICK_ROW_HEIGHT = 22;
const MAX_ROWS = 8;
const BALL_SPEED = 2.2; // Ambient, slow speed
const FRAME_MS = 16; // ~60fps

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const MoodBreakGame = memo(function MoodBreakGame({ captures, tone }: MoodBreakGameProps) {
    // Compute weekly mood stats from captures (same logic as MoodChart)
    const weeklyMoods = useMemo<WeeklyMoodStat[]>(() => {
        const now = new Date();
        const cutoff = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
        const filtered = captures.filter(c => new Date(c.created_at) >= cutoff);

        const moodCounts: Record<string, number> = {};
        const moodSnapshots: Record<string, string> = {};
        let total = 0;

        filtered.forEach(c => {
            if (c.mood_id) {
                moodCounts[c.mood_id] = (moodCounts[c.mood_id] || 0) + 1;
                if (c.mood_name_snapshot) {
                    moodSnapshots[c.mood_id] = c.mood_name_snapshot;
                }
                total++;
            }
        });

        return Object.entries(moodCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([moodId, count]) => {
                const label = moodSnapshots[moodId] || getMoodLabel(moodId);
                return {
                    mood: label,
                    count,
                    percent: total > 0 ? Math.round((count / total) * 100) : 0,
                    color: resolveMoodColorById(moodId, label),
                };
            });
    }, [captures]);

    // Empty state
    if (weeklyMoods.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>No captures yet this week.</ThemedText>
            </View>
        );
    }

    return <GameCanvas weeklyMoods={weeklyMoods} tone={tone} />;
});

// ─────────────────────────────────────────────────────────────────────────────
// Game Canvas (internal, manages layout + game loop)
// ─────────────────────────────────────────────────────────────────────────────

interface GameCanvasProps {
    weeklyMoods: WeeklyMoodStat[];
    tone: AiToneId;
}

function GameCanvas({ weeklyMoods, tone }: GameCanvasProps) {
    const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize({ width, height });
    }, []);

    return (
        <View style={styles.gameContainer} onLayout={onLayout}>
            {containerSize && (
                <GameEngine
                    width={containerSize.width}
                    height={containerSize.height}
                    weeklyMoods={weeklyMoods}
                    tone={tone}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Engine
// ─────────────────────────────────────────────────────────────────────────────

interface GameEngineProps {
    width: number;
    height: number;
    weeklyMoods: WeeklyMoodStat[];
    tone: AiToneId;
}

function GameEngine({ width, height, weeklyMoods, tone }: GameEngineProps) {
    // ── Build bricks from mood data ──
    const initialBricks = useMemo(() => {
        const rows = weeklyMoods.slice(0, MAX_ROWS);
        const maxCount = Math.max(...rows.map(r => r.count), 1);
        // Scale brick width to fit the widest row
        const brickH = BRICK_ROW_HEIGHT;
        const bricks: Brick[] = [];
        const topPadding = 8;

        rows.forEach((moodStat, rowIdx) => {
            const numBricks = Math.max(1, moodStat.count);
            const totalPadding = (numBricks - 1) * BRICK_PADDING;
            const brickW = Math.min(
                (width - totalPadding - 16) / numBricks,
                (width - 16) / Math.max(maxCount, 1)
            );
            const rowWidth = numBricks * brickW + totalPadding;
            const startX = (width - rowWidth) / 2;

            for (let col = 0; col < numBricks; col++) {
                bricks.push({
                    id: `${moodStat.mood}-${rowIdx}-${col}`,
                    x: startX + col * (brickW + BRICK_PADDING),
                    y: topPadding + rowIdx * (brickH + BRICK_PADDING),
                    width: brickW,
                    height: brickH,
                    color: moodStat.color,
                    mood: moodStat.mood,
                    count: moodStat.count,
                    broken: false,
                    opacity: 1,
                    scale: 1,
                });
            }
        });

        return bricks;
    }, [weeklyMoods, width]);

    // ── State ──
    const [bricks, setBricks] = useState<Brick[]>(initialBricks);
    const [microInsight, setMicroInsight] = useState<string | null>(null);
    const [allCleared, setAllCleared] = useState(false);
    const insightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Physics state in refs (avoid re-renders per frame)
    const ballPos = useRef({ x: width / 2, y: height - 50 });
    const ballVel = useRef({ x: BALL_SPEED * 0.7, y: -BALL_SPEED });
    const paddleXRef = useRef(width / 2 - PADDLE_WIDTH / 2);
    const bricksRef = useRef<Brick[]>(initialBricks);
    const gameActive = useRef(true);

    // Animated values for rendering
    const ballX = useSharedValue(width / 2);
    const ballY = useSharedValue(height - 50);
    const paddleX = useSharedValue(width / 2 - PADDLE_WIDTH / 2);

    // Sync bricksRef with state
    useEffect(() => {
        bricksRef.current = initialBricks;
        setBricks(initialBricks);
        gameActive.current = true;
        setAllCleared(false);
        ballPos.current = { x: width / 2, y: height - 50 };
        ballVel.current = { x: BALL_SPEED * 0.7, y: -BALL_SPEED };
        ballX.value = width / 2;
        ballY.value = height - 50;
    }, [initialBricks]);

    // ── Paddle gesture ──
    const paddleGesture = Gesture.Pan()
        .onUpdate((e) => {
            const newX = Math.max(0, Math.min(width - PADDLE_WIDTH, e.absoluteX - PADDLE_WIDTH / 2));
            paddleX.value = newX;
            paddleXRef.current = newX;
        });

    // ── Brick hit handler (called from game loop via runOnJS) ──
    const onBrickHit = useCallback((brickId: string) => {
        const brick = bricksRef.current.find(b => b.id === brickId);
        if (!brick || brick.broken) return;

        // Mark broken in ref
        brick.broken = true;

        // Haptic feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Update rendered bricks
        setBricks(prev => prev.map(b =>
            b.id === brickId ? { ...b, broken: true, opacity: 0, scale: 0.3 } : b
        ));

        // Show micro insight
        const insight = generateMicroInsight(brick.mood, brick.count, tone);
        setMicroInsight(insight);
        if (insightTimer.current) clearTimeout(insightTimer.current);
        insightTimer.current = setTimeout(() => setMicroInsight(null), 1500);

        // Check if all cleared
        const remaining = bricksRef.current.filter(b => !b.broken).length;
        if (remaining === 0) {
            gameActive.current = false;
            setAllCleared(true);
        }
    }, [tone]);

    // ── Game loop ──
    useEffect(() => {
        let frameId: number;

        const tick = () => {
            if (!gameActive.current) return;

            const ball = ballPos.current;
            const vel = ballVel.current;
            const pX = paddleXRef.current;
            const paddleY = height - PADDLE_HEIGHT - 16;

            // Move ball
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

            // Bottom wall (ball resets instead of game over — ambient, forgiving)
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
                // Adjust x velocity based on hit position
                const hitPos = (ball.x - pX) / PADDLE_WIDTH; // 0..1
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
                    // Determine which side was hit
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

                    runOnJS(onBrickHit)(brick.id);
                    break; // One collision per frame
                }
            }

            // Update animated values
            ballX.value = ball.x;
            ballY.value = ball.y;

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frameId);
            if (insightTimer.current) clearTimeout(insightTimer.current);
        };
    }, [width, height, onBrickHit]);

    // ── Animated styles ──
    const ballStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: ballX.value - BALL_RADIUS },
            { translateY: ballY.value - BALL_RADIUS },
        ],
    }));

    const paddleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: paddleX.value }],
    }));

    return (
        <GestureDetector gesture={paddleGesture}>
            <View style={[styles.canvas, { width, height }]}>
                {/* Bricks */}
                {bricks.map(brick => (
                    <Animated.View
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
                            },
                        ]}
                    />
                ))}

                {/* Ball */}
                {!allCleared && (
                    <Animated.View style={[styles.ball, ballStyle]} />
                )}

                {/* Paddle */}
                {!allCleared && (
                    <Animated.View
                        style={[
                            styles.paddle,
                            { top: height - PADDLE_HEIGHT - 16 },
                            paddleStyle,
                        ]}
                    />
                )}

                {/* Micro insight overlay */}
                {microInsight && (
                    <View style={[styles.insightOverlay, { top: height - 48 }]}>
                        <ThemedText style={styles.insightText} numberOfLines={2}>
                            {microInsight}
                        </ThemedText>
                    </View>
                )}

                {/* All cleared state */}
                {allCleared && (
                    <View style={styles.clearedOverlay}>
                        <ThemedText style={styles.clearedText}>Weekly recap ready</ThemedText>
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
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontStyle: 'italic',
    },
    gameContainer: {
        width: '100%',
        height: 300,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    canvas: {
        position: 'relative',
    },
    brick: {
        position: 'absolute',
        borderRadius: 6,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
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
        backgroundColor: 'rgba(255,255,255,0.9)',
        shadowColor: '#fff',
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
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    insightOverlay: {
        position: 'absolute',
        left: 12,
        right: 12,
        alignItems: 'center',
    },
    insightText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        fontStyle: 'italic',
        letterSpacing: 0.3,
    },
    clearedOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clearedText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.55)',
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
