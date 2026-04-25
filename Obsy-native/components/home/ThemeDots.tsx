import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { ThemeDotsConfig } from '@/lib/timeThemes';
import { getGradientEndpoints } from '@/lib/timeThemes';

type Point = { x: number; y: number };

interface ThemeDotsProps {
  panelWidth: number;
  panelHeight: number;
  deg: number;
  horizonPct: number;
  dots: ThemeDotsConfig;
  isPaused: boolean;
}

interface DotParticle {
  key: number;
  coreAlpha: number;
  endX: number;
  endY: number;
  fadeInEnd: number;
  fadeOutEnd: number;
  holdEnd: number;
  lifetime: number;
  phaseDelay: number;
  size: number;
  startX: number;
  startY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function sampleRange(range: readonly [number, number], t: number): number {
  return lerp(range[0], range[1], t);
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function cssAngleToUnitVector(deg: number): Point {
  const rad = ((((deg % 360) + 360) % 360) * Math.PI) / 180;
  return {
    x: Math.sin(rad),
    y: -Math.cos(rad),
  };
}

function perpendicular(vector: Point): Point {
  return { x: -vector.y, y: vector.x };
}

function lineIntersections(
  anchor: Point,
  direction: Point,
  width: number,
  height: number,
): Array<{ point: Point; t: number }> {
  const hits: Array<{ point: Point; t: number }> = [];
  const epsilon = 1e-6;

  if (Math.abs(direction.x) > epsilon) {
    const tLeft = (0 - anchor.x) / direction.x;
    const leftY = anchor.y + tLeft * direction.y;
    if (leftY >= 0 && leftY <= height) hits.push({ point: { x: 0, y: leftY }, t: tLeft });

    const tRight = (width - anchor.x) / direction.x;
    const rightY = anchor.y + tRight * direction.y;
    if (rightY >= 0 && rightY <= height) hits.push({ point: { x: width, y: rightY }, t: tRight });
  }

  if (Math.abs(direction.y) > epsilon) {
    const tTop = (0 - anchor.y) / direction.y;
    const topX = anchor.x + tTop * direction.x;
    if (topX >= 0 && topX <= width) hits.push({ point: { x: topX, y: 0 }, t: tTop });

    const tBottom = (height - anchor.y) / direction.y;
    const bottomX = anchor.x + tBottom * direction.x;
    if (bottomX >= 0 && bottomX <= width) hits.push({ point: { x: bottomX, y: height }, t: tBottom });
  }

  return hits
    .filter((candidate, index) => {
      return !hits.slice(0, index).some((existing) => {
        return (
          Math.abs(existing.point.x - candidate.point.x) < 0.5 &&
          Math.abs(existing.point.y - candidate.point.y) < 0.5
        );
      });
    })
    .sort((a, b) => a.t - b.t);
}

function buildParticles(
  panelWidth: number,
  panelHeight: number,
  deg: number,
  horizonPct: number,
  dots: ThemeDotsConfig,
  rebuildSeed: number,
): DotParticle[] {
  const spreadUnit = Math.min(panelWidth, panelHeight);
  const dotSizePx = (dots.size / 100) * spreadUnit;
  const speedFactor = Math.max(dots.speed, 1) / 100;
  const baseOpacity = clamp(dots.alpha / 100, 0, 1);
  const gradientVector = cssAngleToUnitVector(deg);
  const horizonVector = perpendicular(gradientVector);
  const endpoints = getGradientEndpoints(deg);
  const start = { x: endpoints.x1 * panelWidth, y: endpoints.y1 * panelHeight };
  const end = { x: endpoints.x2 * panelWidth, y: endpoints.y2 * panelHeight };
  const anchor = {
    x: lerp(start.x, end.x, horizonPct),
    y: lerp(start.y, end.y, horizonPct),
  };
  const visibleLine = lineIntersections(anchor, horizonVector, panelWidth, panelHeight);
  const lineStart = visibleLine[0]?.point ?? { x: 0, y: anchor.y };
  const lineEnd = visibleLine[visibleLine.length - 1]?.point ?? { x: panelWidth, y: anchor.y };
  const lineDx = lineEnd.x - lineStart.x;
  const lineDy = lineEnd.y - lineStart.y;
  const strayIndex = Math.floor(seeded(rebuildSeed + 7) * Math.max(dots.count, 1));
  const { logic } = dots;

  return Array.from({ length: dots.count }, (_, index) => {
    const isStray = index === strayIndex;
    const spawnT = sampleRange(logic.alongAxisSpawnRange, seeded(rebuildSeed + index * 17 + 1));
    const jitter = lerp(-0.002, 0.002, seeded(rebuildSeed + index * 17 + 2)) * spreadUnit;
    const reachMultiplier = sampleRange(
      isStray ? logic.strayReachMultiplier : logic.normalReachMultiplier,
      seeded(rebuildSeed + index * 17 + 3),
    );
    const reach = reachMultiplier * (dots.spread / 100) * spreadUnit;
    const lifetime = Math.max(
      300,
      sampleRange(
        isStray ? logic.lifetimeMs.stray : logic.lifetimeMs.normal,
        seeded(rebuildSeed + index * 17 + 4),
      ) / speedFactor,
    );
    const direction = seeded(rebuildSeed + index * 17 + 5) < 0.5 ? -1 : 1;
    const sideDriftPerMs = lerp(-0.00002, 0.00002, seeded(rebuildSeed + index * 17 + 6)) * spreadUnit;
    const phaseDelay = seeded(rebuildSeed + index * 17 + 8) * lifetime;
    const spawnX = lineStart.x + lineDx * spawnT + jitter;
    const spawnY = lineStart.y + lineDy * spawnT;
    const totalSideDrift = sideDriftPerMs * lifetime;
    const startX = spawnX - dotSizePx / 2;
    const startY = spawnY - dotSizePx / 2;
    const endX = startX + gradientVector.x * direction * reach + horizonVector.x * totalSideDrift;
    const endY = startY + gradientVector.y * direction * reach + horizonVector.y * totalSideDrift;

    return {
      key: index,
      coreAlpha: clamp(baseOpacity * logic.coreAlphaFactor, 0, 1),
      endX,
      endY,
      fadeInEnd: logic.fadeCurve.fadeIn[1],
      fadeOutEnd: logic.fadeCurve.fadeOut[1],
      holdEnd: logic.fadeCurve.hold[1],
      lifetime,
      phaseDelay,
      size: dotSizePx,
      startX,
      startY,
    };
  });
}

function ThemeDot({ particle, isPaused }: { particle: DotParticle; isPaused: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }

    progress.stopAnimation();

    if (isPaused) {
      return;
    }

    progress.setValue(0);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(particle.phaseDelay),
        Animated.timing(progress, {
          toValue: 1,
          duration: particle.lifetime,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
      { resetBeforeIteration: true },
    );

    loopRef.current = loop;
    loop.start();

    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
      progress.stopAnimation();
    };
  }, [isPaused, particle.lifetime, particle.phaseDelay, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [particle.startX, particle.endX],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [particle.startY, particle.endY],
  });

  const opacity = progress.interpolate({
    inputRange: [0, particle.fadeInEnd, particle.holdEnd, particle.fadeOutEnd],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dotWrapper,
        {
          width: particle.size,
          height: particle.size,
          opacity,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.core,
          {
            width: particle.size,
            height: particle.size,
            borderRadius: particle.size / 2,
            left: 0,
            top: 0,
            opacity: particle.coreAlpha,
          },
        ]}
      />
    </Animated.View>
  );
}

export function ThemeDots({ panelWidth, panelHeight, deg, horizonPct, dots, isPaused }: ThemeDotsProps) {
  const rebuildSeed = useMemo(() => Math.random() * 100_000, [
    deg,
    dots.alpha,
    dots.count,
    dots.size,
    dots.speed,
    dots.spread,
    horizonPct,
    panelHeight,
    panelWidth,
  ]);

  const particles = useMemo(() => {
    return buildParticles(panelWidth, panelHeight, deg, horizonPct, dots, rebuildSeed);
  }, [deg, dots, horizonPct, panelHeight, panelWidth, rebuildSeed]);

  if (panelWidth <= 0 || panelHeight <= 0 || dots.count <= 0) {
    return null;
  }

  return (
    <>
      {particles.map((particle) => (
        <ThemeDot key={particle.key} particle={particle} isPaused={isPaused} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  dotWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  core: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
});
