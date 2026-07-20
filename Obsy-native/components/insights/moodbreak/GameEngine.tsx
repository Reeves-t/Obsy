import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
    Easing,
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    ZoomOut,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { AiToneId } from '@/lib/aiTone';
import {
    Ball,
    BALL_RADIUS,
    BALL_SPEED,
    BannerData,
    BANNER_GAP_MS,
    BANNER_MS,
    Brick,
    BRICKS_PER_ROW,
    buildBricks,
    Burst,
    CaptureRow,
    CHARGE_LABELS,
    COMBO_WINDOW_MS,
    FIREBALL_MS,
    GamePhase,
    generateClearedSummary,
    generateMicroInsight,
    MAX_BALLS,
    MAX_BURSTS,
    MAX_POPS,
    MISS_PENALTY,
    MULTIBALL_SPEED_FACTORS,
    PADDLE_HEIGHT,
    PADDLE_WIDTH,
    POINTS_PER_BRICK,
    Pop,
    WIDE_FACTOR,
    WIDE_PADDLE_MS,
} from './engine';
import { BurstLayer, ChargedShimmer, FallingInsight, PauseOverlay, PopsLayer } from './effects';

// ─────────────────────────────────────────────────────────────────────────────
// Brick field — memoized so the per-frame tick never re-renders the gradients.
// Each brick is its own memo component: on a break, unbroken bricks keep their
// object identity through setBricks, so only the removed ones do any work —
// critical during fireball, when breaks happen nearly every frame.
// ─────────────────────────────────────────────────────────────────────────────

const BrickView = memo(function BrickView({
    brick,
    borderColor,
    clock,
}: {
    brick: Brick;
    borderColor: string;
    clock: SharedValue<number>;
}) {
    return (
        <Animated.View
            exiting={ZoomOut.duration(150)}
            style={[
                styles.brick,
                {
                    left: brick.x,
                    top: brick.y,
                    width: brick.width,
                    height: brick.height,
                    shadowColor: brick.color,
                    borderColor,
                },
            ]}
        >
            <LinearGradient
                colors={[brick.gradientFrom, brick.gradientMid, brick.gradientTo]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
            />
            {brick.charged && (
                <ChargedShimmer clock={clock} phase={((brick.row * 3 + brick.col * 7) % 10) / 10} />
            )}
        </Animated.View>
    );
});

const BrickField = memo(function BrickField({ bricks, isLight }: { bricks: Brick[]; isLight: boolean }) {
    const clock = useSharedValue(0);

    useEffect(() => {
        clock.value = 0;
        clock.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const brickBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';

    return (
        <>
            {bricks.filter(b => !b.broken).map(brick => (
                <BrickView key={brick.id} brick={brick} borderColor={brickBorder} clock={clock} />
            ))}
        </>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Balls — re-rendered every frame via the parent's tick; ≤6 cheap Views
// ─────────────────────────────────────────────────────────────────────────────

function BallLayer({ balls, fireball, isLight }: { balls: Ball[]; fireball: boolean; isLight: boolean }) {
    const ballColor = fireball ? '#FF9142' : isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    const ballShadow = fireball ? '#FF6B1A' : isLight ? '#000' : '#fff';
    return (
        <>
            {balls.map(b => (
                <View
                    key={b.id}
                    style={[
                        styles.ball,
                        fireball && styles.ballFire,
                        {
                            left: b.x - BALL_RADIUS,
                            top: b.y - BALL_RADIUS,
                            backgroundColor: ballColor,
                            shadowColor: ballShadow,
                        },
                    ]}
                />
            ))}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Paddle — left/width follow the physics refs per frame; squash-stretch and
// wide-paddle width changes animate on the UI thread
// ─────────────────────────────────────────────────────────────────────────────

function Paddle({
    x,
    y,
    width,
    squash,
    isLight,
}: {
    x: number;
    y: number;
    width: number;
    squash: SharedValue<number>;
    isLight: boolean;
}) {
    const w = useSharedValue(width);

    useEffect(() => {
        w.value = withTiming(width, { duration: 200 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width]);

    const style = useAnimatedStyle(() => ({
        width: w.value,
        transform: [
            { scaleY: 1 - 0.35 * squash.value },
            { scaleX: 1 + 0.12 * squash.value },
        ],
    }));

    return (
        <Animated.View
            style={[
                styles.paddle,
                {
                    left: x,
                    top: y,
                    backgroundColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)',
                    borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
                },
                style,
            ]}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface GameEngineProps {
    width: number;
    height: number;
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
    /** Reports live score/combo/combo-points so the parent can render them outside the canvas */
    onStats: (score: number, combo: number, comboPoints: number) => void;
}

export function GameEngine({
    width,
    height,
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
}: GameEngineProps) {
    // ── Mutable engine state (refs — never re-created per render) ──
    const bricksRef = useRef<Brick[]>([]);
    const ballsRef = useRef<Ball[]>([]);
    const paddleXRef = useRef(width / 2 - PADDLE_WIDTH / 2);
    const paddleWidthRef = useRef(PADDLE_WIDTH);
    // Remaining-ms timers (not deadlines) so they freeze while the loop is paused
    const widePaddleMsRef = useRef(0);
    const fireballMsRef = useRef(0);
    const comboMsRef = useRef(0);
    const scoreRef = useRef(0);
    const comboRef = useRef(1);
    const maxComboRef = useRef(1);
    const comboPointsRef = useRef(0); // points earned within the current combo chain
    const missCountRef = useRef(0); // forgiving bottom-resets — 0 at week clear = perfect game
    const lastHapticMsRef = useRef(0); // gate so fireball chains don't spam the haptic engine
    const moodRemainingRef = useRef<Map<string, number>>(new Map());
    const nextIdRef = useRef(1);
    const gameActiveRef = useRef(false);

    // ── Render state (discrete events only, except the per-frame tick) ──
    const [bricks, setBricks] = useState<Brick[]>([]);
    const [, setTick] = useState(0);
    const [score, setScore] = useState(0);
    const [maxCombo, setMaxCombo] = useState(1);
    const [pops, setPops] = useState<Pop[]>([]);
    const [bursts, setBursts] = useState<Burst[]>([]);
    const [activeBanner, setActiveBanner] = useState<BannerData | null>(null);
    const [fireballActive, setFireballActive] = useState(false);
    const [paddleWide, setPaddleWide] = useState(false);

    const bannerQueueRef = useRef<BannerData[]>([]);
    const bannerBusyRef = useRef(false);
    const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const paddleSquash = useSharedValue(0);

    // ── Full engine reset when the brick layout inputs change (also on mount) ──
    useEffect(() => {
        const newBricks = buildBricks(rows, width, height, seed);
        bricksRef.current = newBricks;
        setBricks(newBricks);

        const remaining = new Map<string, number>();
        newBricks.forEach(b => remaining.set(b.moodId, (remaining.get(b.moodId) || 0) + 1));
        moodRemainingRef.current = remaining;

        ballsRef.current = [{
            id: nextIdRef.current++,
            x: width / 2,
            y: height - 50,
            vx: BALL_SPEED * 0.7,
            vy: -BALL_SPEED,
            speed: BALL_SPEED,
        }];
        paddleXRef.current = width / 2 - PADDLE_WIDTH / 2;
        paddleWidthRef.current = PADDLE_WIDTH;
        widePaddleMsRef.current = 0;
        fireballMsRef.current = 0;
        comboMsRef.current = 0;
        scoreRef.current = 0;
        comboRef.current = 1;
        maxComboRef.current = 1;
        comboPointsRef.current = 0;
        missCountRef.current = 0;
        setScore(0);
        setMaxCombo(1);
        onStats(0, 1, 0);
        setFireballActive(false);
        setPaddleWide(false);
        setPops([]);
        setBursts([]);
        bannerQueueRef.current = [];
        bannerBusyRef.current = false;
        if (bannerTimerRef.current) {
            clearTimeout(bannerTimerRef.current);
            bannerTimerRef.current = null;
        }
        setActiveBanner(null);
        setTick(t => t + 1);
    }, [rows, width, height, seed, onStats]);

    // Fresh ball when a game starts
    useEffect(() => {
        if (gamePhase === 'playing') {
            ballsRef.current = [{
                id: nextIdRef.current++,
                x: width / 2,
                y: height - 50,
                vx: BALL_SPEED * (Math.random() > 0.5 ? 0.7 : -0.7),
                vy: -BALL_SPEED,
                speed: BALL_SPEED,
            }];
        }
    }, [gamePhase, width, height]);

    // Banner timers cleaned up on unmount
    useEffect(() => () => {
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    }, []);

    // ── Pops / bursts ──
    const spawnPop = useCallback((x: number, y: number, text: string, color: string) => {
        const id = nextIdRef.current++;
        const px = Math.max(30, Math.min(width - 30, x));
        setPops(prev => {
            const next = [...prev, { id, x: px, y, text, color }];
            return next.length > MAX_POPS ? next.slice(next.length - MAX_POPS) : next;
        });
    }, [width]);

    const spawnBurst = useCallback((x: number, y: number, colors: [string, string, string], big: boolean) => {
        const id = nextIdRef.current++;
        setBursts(prev => {
            const next = [...prev, { id, x, y, colors, big }];
            return next.length > MAX_BURSTS ? next.slice(next.length - MAX_BURSTS) : next;
        });
    }, []);

    const removePop = useCallback((id: number) => {
        setPops(prev => prev.filter(p => p.id !== id));
    }, []);

    const removeBurst = useCallback((id: number) => {
        setBursts(prev => prev.filter(b => b.id !== id));
    }, []);

    // ── Banner queue: show 2.5s → 250ms gap → next ──
    const pumpBanner = useCallback(() => {
        const next = bannerQueueRef.current.shift();
        if (!next) {
            bannerBusyRef.current = false;
            return;
        }
        bannerBusyRef.current = true;
        setActiveBanner(next);
        bannerTimerRef.current = setTimeout(() => {
            setActiveBanner(null);
            bannerTimerRef.current = setTimeout(pumpBanner, BANNER_GAP_MS);
        }, BANNER_MS);
    }, []);

    const enqueueBanner = useCallback((banner: BannerData) => {
        bannerQueueRef.current.push(banner);
        if (!bannerBusyRef.current) pumpBanner();
    }, [pumpBanner]);

    const triggerSquash = useCallback(() => {
        paddleSquash.value = withSequence(
            withTiming(1, { duration: 40 }),
            withSpring(0, { damping: 14, stiffness: 300 }),
        );
    }, [paddleSquash]);

    // ── Break processing — queue-based so bombs can chain. Accepts a batch so
    //    a fireball pass hands over all pierced bricks in ONE call (one state
    //    update, one haptic) instead of one call per brick. ──
    const processBreak = useCallback((hit: Brick | Brick[]) => {
        const brickAt = (row: number, col: number): Brick | null => {
            if (col < 0 || col >= BRICKS_PER_ROW || row < 0) return null;
            const idx = row * BRICKS_PER_ROW + col;
            return idx < bricksRef.current.length ? bricksRef.current[idx] : null;
        };

        const queue: Brick[] = Array.isArray(hit) ? [...hit] : [hit];
        const brokenNow: { brick: Brick; pts: number }[] = [];
        const bannersToQueue: BannerData[] = [];
        let mediumHaptic = false;
        let pointsGained = 0;

        while (queue.length > 0) {
            const b = queue.shift()!;
            if (b.broken) continue;
            b.broken = true;

            const pts = POINTS_PER_BRICK * comboRef.current;
            scoreRef.current += pts;
            pointsGained += pts;
            brokenNow.push({ brick: b, pts });
            comboRef.current += 1; // uncapped — long chains keep multiplying
            maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
            comboMsRef.current = COMBO_WINDOW_MS;

            const remaining = (moodRemainingRef.current.get(b.moodId) ?? 1) - 1;
            moodRemainingRef.current.set(b.moodId, remaining);
            if (remaining === 0) {
                bannersToQueue.push({ text: generateMicroInsight(b.mood, b.count, tone) });
                mediumHaptic = true;
            }

            if (b.charged) {
                mediumHaptic = true;
                switch (b.charged) {
                    case 'multiball': {
                        let spawned = 0;
                        for (let i = 0; i < 2; i++) {
                            if (ballsRef.current.length >= MAX_BALLS) break;
                            // Different speeds per spawn so the balls spread out
                            const sp = BALL_SPEED * MULTIBALL_SPEED_FACTORS[i % MULTIBALL_SPEED_FACTORS.length];
                            ballsRef.current.push({
                                id: nextIdRef.current++,
                                x: b.x + b.width / 2,
                                y: b.y + b.height + BALL_RADIUS + 1,
                                vx: (i === 0 ? -0.6 : 0.6) * sp,
                                vy: sp,
                                speed: sp,
                            });
                            spawned++;
                        }
                        if (spawned < 2) {
                            // At the ball cap — convert the excess to points
                            scoreRef.current += 50;
                            pointsGained += 50;
                        }
                        break;
                    }
                    case 'widepaddle': {
                        widePaddleMsRef.current = WIDE_PADDLE_MS; // refresh, not additive
                        paddleWidthRef.current = Math.round(PADDLE_WIDTH * WIDE_FACTOR);
                        paddleXRef.current = Math.max(0, Math.min(width - paddleWidthRef.current, paddleXRef.current));
                        setPaddleWide(true);
                        break;
                    }
                    case 'fireball': {
                        fireballMsRef.current = FIREBALL_MS; // refresh, not additive
                        setFireballActive(true);
                        break;
                    }
                    case 'bomb': {
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const nb = brickAt(b.row + dr, b.col + dc);
                                if (nb && !nb.broken) queue.push(nb);
                            }
                        }
                        break;
                    }
                }
            }
        }

        if (brokenNow.length === 0) return;

        setBricks(prev => prev.map(pb =>
            brokenNow.some(bn => bn.brick.id === pb.id) ? { ...pb, broken: true } : pb
        ));

        comboPointsRef.current += pointsGained;

        // Pops & bursts — multi-brick events merge into one pop + one big burst.
        // Fireball merges aggressively (≥2) to keep effect churn off the JS thread.
        const mergeThreshold = fireballMsRef.current > 0 ? 1 : 3;
        if (brokenNow.length > mergeThreshold) {
            const origin = brokenNow[0].brick;
            spawnPop(origin.x + origin.width / 2, origin.y, `+${pointsGained}`, origin.color);
            spawnBurst(
                origin.x + origin.width / 2,
                origin.y + origin.height / 2,
                [origin.gradientFrom, origin.gradientMid, origin.gradientTo],
                brokenNow.length > 3,
            );
        } else {
            for (const { brick: bb, pts } of brokenNow) {
                const text = bb.charged ? CHARGE_LABELS[bb.charged] : `+${pts}`;
                spawnPop(bb.x + bb.width / 2, bb.y, text, bb.color);
                spawnBurst(
                    bb.x + bb.width / 2,
                    bb.y + bb.height / 2,
                    [bb.gradientFrom, bb.gradientMid, bb.gradientTo],
                    false,
                );
            }
        }

        setScore(scoreRef.current);
        setMaxCombo(maxComboRef.current);
        onStats(scoreRef.current, comboRef.current, comboPointsRef.current);

        const remainingTotal = bricksRef.current.filter(b => !b.broken).length;
        if (remainingTotal === 0) {
            gameActiveRef.current = false;
            widePaddleMsRef.current = 0;
            fireballMsRef.current = 0;
            comboMsRef.current = 0;
            paddleWidthRef.current = PADDLE_WIDTH;
            setFireballActive(false);
            setPaddleWide(false);
            bannerQueueRef.current = [];
            bannerBusyRef.current = false;
            if (bannerTimerRef.current) {
                clearTimeout(bannerTimerRef.current);
                bannerTimerRef.current = null;
            }
            setActiveBanner(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onCleared();
            return;
        }

        // Haptic gate — fireball/bomb chains fire many breaks per second, and
        // spamming the haptic engine visibly stalls the JS thread.
        const nowMs = Date.now();
        if (nowMs - lastHapticMsRef.current > 80) {
            lastHapticMsRef.current = nowMs;
            if (mediumHaptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        bannersToQueue.forEach(enqueueBanner);
    }, [tone, width, spawnPop, spawnBurst, enqueueBanner, onCleared, onStats]);

    // ── Per-substep ball physics ──
    const stepBall = useCallback((ball: Ball, f: number, removed: number[]) => {
        ball.x += ball.vx * f;
        ball.y += ball.vy * f;

        // Walls
        if (ball.x - BALL_RADIUS <= 0) {
            ball.x = BALL_RADIUS;
            ball.vx = Math.abs(ball.vx);
        }
        if (ball.x + BALL_RADIUS >= width) {
            ball.x = width - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y - BALL_RADIUS <= 0) {
            ball.y = BALL_RADIUS;
            ball.vy = Math.abs(ball.vy);
        }

        // Bottom — extra balls die, the last ball gets the forgiving reset
        if (ball.y + BALL_RADIUS >= height) {
            const alive = ballsRef.current.length - removed.length;
            if (alive > 1) {
                removed.push(ball.id);
                return;
            }
            ball.y = height - 50;
            ball.x = width / 2;
            ball.vx = ball.speed * (Math.random() > 0.5 ? 0.7 : -0.7);
            ball.vy = -ball.speed;
            // Missing the only ball costs points and breaks the combo
            missCountRef.current += 1;
            scoreRef.current = Math.max(0, scoreRef.current - MISS_PENALTY);
            spawnPop(width / 2, height - 70, `-${MISS_PENALTY}`, '#FF5540');
            comboRef.current = 1;
            comboMsRef.current = 0;
            comboPointsRef.current = 0;
            setScore(scoreRef.current);
            onStats(scoreRef.current, 1, 0);
        }

        // Paddle
        const pW = paddleWidthRef.current;
        const pX = paddleXRef.current;
        const paddleY = height - PADDLE_HEIGHT - 16;
        if (
            ball.y + BALL_RADIUS >= paddleY &&
            ball.y + BALL_RADIUS <= paddleY + PADDLE_HEIGHT + 4 &&
            ball.x >= pX &&
            ball.x <= pX + pW &&
            ball.vy > 0
        ) {
            ball.vy = -Math.abs(ball.vy);
            const hitPos = (ball.x - pX) / pW;
            ball.vx = ball.speed * (hitPos - 0.5) * 2;
            ball.y = paddleY - BALL_RADIUS;
            triggerSquash();
        }

        // Bricks
        if (fireballMsRef.current > 0) {
            // Fireball pierces: no reflection. Collect everything this ball
            // overlaps and hand it to processBreak as ONE batch — per-brick
            // calls here are what made fireball stall the JS thread.
            let pierced: Brick[] | null = null;
            for (const brick of bricksRef.current) {
                if (brick.broken) continue;
                if (
                    ball.x + BALL_RADIUS > brick.x &&
                    ball.x - BALL_RADIUS < brick.x + brick.width &&
                    ball.y + BALL_RADIUS > brick.y &&
                    ball.y - BALL_RADIUS < brick.y + brick.height
                ) {
                    (pierced ??= []).push(brick);
                }
            }
            if (pierced) processBreak(pierced);
            return;
        }
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
                    ball.vy = -ball.vy;
                } else {
                    ball.vx = -ball.vx;
                }

                processBreak(brick);
                break;
            }
        }
    }, [width, height, processBreak, triggerSquash, onStats, spawnPop]);

    // ── Game loop — rAF with delta time; fully cancelled while paused ──
    useEffect(() => {
        if (gamePhase !== 'playing' || paused) return;

        gameActiveRef.current = true;
        let last: number | null = null;
        let raf = 0;

        const frame = (now: number) => {
            if (!gameActiveRef.current) return;
            if (last === null) {
                last = now;
                raf = requestAnimationFrame(frame);
                return;
            }
            const dt = Math.min(now - last, 33.4); // never simulate > 2 baseline frames
            last = now;
            const frames = dt / (1000 / 60);

            // Power-up / combo timers (remaining ms — frozen whenever the loop is stopped)
            if (widePaddleMsRef.current > 0) {
                widePaddleMsRef.current -= dt;
                if (widePaddleMsRef.current <= 0) {
                    widePaddleMsRef.current = 0;
                    paddleWidthRef.current = PADDLE_WIDTH;
                    paddleXRef.current = Math.min(paddleXRef.current, width - PADDLE_WIDTH);
                    setPaddleWide(false);
                }
            }
            if (fireballMsRef.current > 0) {
                fireballMsRef.current -= dt;
                if (fireballMsRef.current <= 0) {
                    fireballMsRef.current = 0;
                    setFireballActive(false);
                }
            }
            if (comboMsRef.current > 0) {
                comboMsRef.current -= dt;
                if (comboMsRef.current <= 0) {
                    comboMsRef.current = 0;
                    comboRef.current = 1;
                    comboPointsRef.current = 0;
                    onStats(scoreRef.current, 1, 0);
                }
            }

            // Sub-steps keep per-step displacement below the min brick height (no tunneling)
            const substeps = Math.max(1, Math.ceil(frames));
            const stepF = frames / substeps;
            for (let s = 0; s < substeps && gameActiveRef.current; s++) {
                const snapshot = [...ballsRef.current];
                const removed: number[] = [];
                for (const ball of snapshot) {
                    stepBall(ball, stepF, removed);
                }
                if (removed.length > 0) {
                    ballsRef.current = ballsRef.current.filter(b => !removed.includes(b.id));
                }
            }

            setTick(t => t + 1); // single per-frame state write
            raf = requestAnimationFrame(frame);
        };

        raf = requestAnimationFrame(frame);
        return () => {
            cancelAnimationFrame(raf);
            gameActiveRef.current = false;
        };
    }, [gamePhase, paused, width, stepBall, onStats]);

    // ── Paddle gesture — horizontal drags move the paddle, vertical drags
    //    fail fast so the page ScrollView keeps scrolling ──
    const paddleGesture = useMemo(() =>
        Gesture.Pan()
            .enabled(gamePhase === 'playing' && !paused)
            .activeOffsetX([-8, 8])
            .failOffsetY([-12, 12])
            .runOnJS(true)
            .onUpdate(e => {
                if (!gameActiveRef.current) return;
                const pW = paddleWidthRef.current;
                paddleXRef.current = Math.max(0, Math.min(width - pW, e.x - pW / 2));
            }),
    [gamePhase, paused, width]);

    // Encouraging recap of every mood captured this week, for the cleared screen
    const clearedSummary = useMemo(() => generateClearedSummary(rows), [rows]);

    // Theme-aware colors
    const overlayTextColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)';
    const subtleTextColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';
    const buttonBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    const buttonBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';

    const isPlaying = gamePhase === 'playing';

    return (
        <GestureDetector gesture={paddleGesture}>
            <View style={[styles.canvas, { width, height }]}>
                <BrickField bricks={bricks} isLight={isLight} />

                {isPlaying && (
                    <BallLayer balls={ballsRef.current} fireball={fireballActive} isLight={isLight} />
                )}

                {isPlaying && (
                    <Paddle
                        x={paddleXRef.current}
                        y={height - PADDLE_HEIGHT - 16}
                        width={paddleWidthRef.current}
                        squash={paddleSquash}
                        isLight={isLight}
                    />
                )}

                <BurstLayer bursts={bursts} onDone={removeBurst} />
                <PopsLayer pops={pops} onDone={removePop} />

                {isPlaying && activeBanner && (
                    <FallingInsight key={activeBanner.text} text={activeBanner.text} isLight={isLight} />
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
                        <ThemedText style={[styles.clearedStats, { color: subtleTextColor }]}>
                            {missCountRef.current === 0
                                ? `Score ${score} · Perfect combo`
                                : `Score ${score} · Best combo ×${maxCombo}`}
                        </ThemedText>
                        <ThemedText style={[styles.clearedInsight, { color: subtleTextColor }]} numberOfLines={3}>
                            {clearedSummary}
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

                {/* PAUSED — scrolled away or app backgrounded */}
                {isPlaying && paused && <PauseOverlay onResume={onResume} isLight={isLight} />}
            </View>
        </GestureDetector>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    canvas: {
        position: 'relative',
    },
    brick: {
        position: 'absolute',
        borderRadius: 4,
        borderWidth: 0.5,
        overflow: 'hidden',
        opacity: 0.85,
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
    ballFire: {
        shadowOpacity: 0.9,
        shadowRadius: 12,
        elevation: 6,
    },
    paddle: {
        position: 'absolute',
        height: PADDLE_HEIGHT,
        borderRadius: PADDLE_HEIGHT / 2,
        borderWidth: 0.5,
    },
    overlayCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
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
    clearedStats: {
        fontSize: 12,
        marginTop: 6,
        letterSpacing: 0.5,
        fontVariant: ['tabular-nums'],
    },
    clearedInsight: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 10,
        textAlign: 'center',
        letterSpacing: 0.3,
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
