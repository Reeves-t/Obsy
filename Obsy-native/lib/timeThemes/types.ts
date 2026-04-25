// ─── Time-Based Theme Types ───────────────────────────────────────────────────
// These types mirror the sandbox export format exactly.
// When you export from the sandbox, the shape of the data matches these types.

export interface ThemeStop {
  /** Human-readable label (e.g. "Sky top", "Horizon") */
  name: string;
  /** Hex color string, e.g. "#f8d3f5" */
  color: string;
  /** Position along the gradient, 0–100 */
  pos: number;
}

export interface ThemePeriod {
  stops: ThemeStop[];
}

export interface TimeRange {
  /** "HH:MM" 24-hour format */
  start: string;
  /** "HH:MM" 24-hour format */
  end: string;
}

export interface ThemeGlobal {
  /** Gradient angle in degrees (180 = top → bottom) */
  deg: number;
  /** Film grain intensity, 0–100 */
  grain: number;
  /** Saturation multiplier, 0–200 (100 = no change) */
  sat: number;
  dotCount: number;
  dotSpread: number;
  dotSize: number;
  dotSpeed: number;
  dotAlpha: number;
}

export interface ThemeDotLifetimeMs {
  normal: [number, number];
  stray: [number, number];
}

export interface ThemeDotFadeCurve {
  fadeIn: [number, number];
  hold: [number, number];
  fadeOut: [number, number];
}

export interface ThemeDotGlowHalo {
  radiusMultiplier: number;
  midStopAlphaFactor: number;
}

export interface ThemeDotLogic {
  anchor: string;
  spawnOn: string;
  driftAxis: string;
  driftDirection: string;
  strayRule: string;
  strayReachMultiplier: [number, number];
  normalReachMultiplier: [number, number];
  lifetimeMs: ThemeDotLifetimeMs;
  easing: string;
  fadeCurve: ThemeDotFadeCurve;
  spreadUnit: string;
  alongAxisSpawnRange: [number, number];
  alongAxisDrift: string;
  glowHalo: ThemeDotGlowHalo;
  coreAlphaFactor: number;
  blendMode: string;
  horizontalJitterAtSpawn: string;
}

export interface ThemeDotsConfig {
  count: number;
  spread: number;
  size: number;
  speed: number;
  alpha: number;
  logic: ThemeDotLogic;
}

/**
 * The full preset object that your sandbox exports.
 * Drop any export directly into lib/timeThemes/presets/ and it will type-check.
 */
export interface TimeThemePreset {
  name: string;
  version: number;
  timeRanges: {
    morning: TimeRange;
    afternoon: TimeRange;
    evening: TimeRange;
  };
  morning: ThemePeriod;
  afternoon: ThemePeriod;
  evening: ThemePeriod;
  global: ThemeGlobal;
  dots?: ThemeDotsConfig;
}

// ─── Runtime Types ────────────────────────────────────────────────────────────

export type PeriodName = 'morning' | 'afternoon' | 'evening';

/** What period the current time falls into */
export type PeriodState =
  | { transition: false; period: PeriodName }
  | { transition: true; from: PeriodName; to: PeriodName; t: number };

/** What the hook returns — ready to hand straight to a gradient renderer */
export interface GradientOutput {
  /** Hex color for each stop */
  colors: string[];
  /** Normalized position for each stop, 0.0–1.0 */
  locations: number[];
  /** Gradient angle in degrees */
  deg: number;
  /** Which period (or transition) is active */
  periodState: PeriodState;
  /**
   * Position of the "Horizon" stop along the gradient axis, 0.0–1.0.
   * Combine this with the gradient angle to reconstruct the full horizon line.
   */
  horizonPct: number;
  /** Hex color of the "Horizon" stop */
  horizonColor: string;
  /** Full global settings — dot count, spread, size, speed, alpha, grain, sat */
  global: ThemeGlobal;
  /** Full dot configuration from the preset, including exact animation logic */
  dots: ThemeDotsConfig;
}
