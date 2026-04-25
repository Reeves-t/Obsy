// Time-theme preset — generated 2026-04-20T00:37:53.911Z
import type { TimeThemePreset } from '../types';

export const currentPreset: TimeThemePreset = {
  name: 'current',
  version: 1,
  timeRanges: {
    morning: {
      start: '06:00',
      end: '11:30',
    },
    afternoon: {
      start: '12:00',
      end: '17:30',
    },
    evening: {
      start: '18:00',
      end: '05:59',
    },
  },
  morning: {
    stops: [
      { name: 'Sky top', color: '#434242', pos: 0 },
      { name: 'Sky mid', color: '#d1d1d1', pos: 35 },
      { name: 'Upper haze', color: '#f8e2ce', pos: 47 },
      { name: 'Horizon', color: '#f8d3f5', pos: 50 },
      { name: 'Lower haze', color: '#f4e0cd', pos: 56 },
      { name: 'Ground mid', color: '#ecebe9', pos: 67 },
      { name: 'Ground deep', color: '#545454', pos: 100 },
    ],
  },
  afternoon: {
    stops: [
      { name: 'Sky top', color: '#1d3862', pos: 0 },
      { name: 'Sky mid', color: '#6a8cb8', pos: 22 },
      { name: 'Upper haze', color: '#b5c8e0', pos: 40 },
      { name: 'Horizon', color: '#dedede', pos: 51 },
      { name: 'Lower haze', color: '#9ab0c8', pos: 62 },
      { name: 'Ground mid', color: '#54677d', pos: 78 },
      { name: 'Ground deep', color: '#102f4c', pos: 100 },
    ],
  },
  evening: {
    stops: [
      { name: 'Sky top', color: '#000000', pos: 6 },
      { name: 'Sky mid', color: '#171616', pos: 14 },
      { name: 'Upper haze', color: '#2e2d2d', pos: 37 },
      { name: 'Horizon', color: '#31456d', pos: 53 },
      { name: 'Lower haze', color: '#2e2d2d', pos: 62 },
      { name: 'Ground mid', color: '#121212', pos: 76 },
      { name: 'Ground deep', color: '#0a0a0a', pos: 90 },
    ],
  },
  global: {
    deg: 45,
    grain: 33,
    sat: 160,
    dotCount: 40,
    dotSpread: 2,
    dotSize: 1.3,
    dotSpeed: 200,
    dotAlpha: 100,
  },
  dots: {
    count: 40,
    spread: 2,
    size: 1.3,
    speed: 200,
    alpha: 100,
    logic: {
      anchor: "stop named 'Horizon' (or middle stop if none)",
      spawnOn: 'horizon line (perpendicular to gradient axis)',
      driftAxis: 'perpendicular to gradient (aligned with gradient angle vector)',
      driftDirection: 'bidirectional random (+1 or -1 at spawn)',
      strayRule: 'exactly 1 stray dot per panel, chosen at rebuild',
      strayReachMultiplier: [3.2, 4.6],
      normalReachMultiplier: [0.4, 1.1],
      lifetimeMs: {
        normal: [2200, 6000],
        stray: [6500, 10000],
      },
      easing: 'easeOutQuad: 1 - (1 - t)^2 where t = age/lifetime',
      fadeCurve: {
        fadeIn: [0, 0.18],
        hold: [0.18, 0.55],
        fadeOut: [0.55, 1],
      },
      spreadUnit: 'min(panelWidth, panelHeight)',
      alongAxisSpawnRange: [-0.2, 1.2],
      alongAxisDrift: 'vu ∈ [-0.00002, 0.00002] per ms',
      glowHalo: {
        radiusMultiplier: 4,
        midStopAlphaFactor: 0.25,
      },
      coreAlphaFactor: 1.4,
      blendMode: 'screen',
      horizontalJitterAtSpawn: '±0.002 of min(W,H)',
    },
  },
};
