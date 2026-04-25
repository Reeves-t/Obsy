import type {
  ThemeDotsConfig,
  ThemeStop,
  TimeThemePreset,
  PeriodName,
  PeriodState,
  GradientOutput,
} from './types';

const DEFAULT_DOT_LOGIC: ThemeDotsConfig['logic'] = {
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
};

function fallbackDotsConfig(preset: TimeThemePreset): ThemeDotsConfig {
  return {
    count: preset.global.dotCount,
    spread: preset.global.dotSpread,
    size: preset.global.dotSize,
    speed: preset.global.dotSpeed,
    alpha: preset.global.dotAlpha,
    logic: DEFAULT_DOT_LOGIC,
  };
}

// ─── Time Helpers ─────────────────────────────────────────────────────────────

/** Parse "HH:MM" into total minutes since midnight */
function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Current time as minutes since midnight */
function nowInMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

// ─── Color Interpolation ──────────────────────────────────────────────────────

/** Linear interpolation between two hex colors */
function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);

  const r = Math.round(ar + (br - ar) * t).toString(16).padStart(2, '0');
  const g = Math.round(ag + (bg - ag) * t).toString(16).padStart(2, '0');
  const bv = Math.round(ab + (bb - ab) * t).toString(16).padStart(2, '0');
  return `#${r}${g}${bv}`;
}

/**
 * Blend two stop arrays together at position t (0 = fully `from`, 1 = fully `to`).
 * Both arrays must have the same length (guaranteed when using same-version presets).
 */
function lerpStops(from: ThemeStop[], to: ThemeStop[], t: number): ThemeStop[] {
  return from.map((stop, i) => ({
    name: stop.name,
    color: lerpHex(stop.color, to[i].color, t),
    pos: stop.pos + (to[i].pos - stop.pos) * t,
  }));
}

// ─── Period Detection ─────────────────────────────────────────────────────────

/**
 * Determine which period the given time falls into.
 *
 * Transition windows are the gaps between defined time ranges:
 *   morning end → afternoon start  (e.g. 11:30–12:00)
 *   afternoon end → evening start  (e.g. 17:30–18:00)
 *   evening end → morning start    (e.g. 05:59–06:00, wraps midnight)
 *
 * During a transition, `t` is 0–1 where 0 = still looks like `from` and
 * 1 = fully looks like `to`.
 */
export function getPeriodState(date: Date, preset: TimeThemePreset): PeriodState {
  const mins = nowInMinutes(date);
  const { morning, afternoon, evening } = preset.timeRanges;

  const mStart = parseHHMM(morning.start);
  const mEnd   = parseHHMM(morning.end);
  const aStart = parseHHMM(afternoon.start);
  const aEnd   = parseHHMM(afternoon.end);
  const eStart = parseHHMM(evening.start);
  const eEnd   = parseHHMM(evening.end); // may be < eStart (wraps midnight)

  // ── Morning ──────────────────────────────────────────
  if (mins >= mStart && mins <= mEnd) {
    return { transition: false, period: 'morning' };
  }

  // ── Morning → Afternoon transition ───────────────────
  if (mins > mEnd && mins < aStart) {
    const t = (mins - mEnd) / (aStart - mEnd);
    return { transition: true, from: 'morning', to: 'afternoon', t };
  }

  // ── Afternoon ─────────────────────────────────────────
  if (mins >= aStart && mins <= aEnd) {
    return { transition: false, period: 'afternoon' };
  }

  // ── Afternoon → Evening transition ────────────────────
  if (mins > aEnd && mins < eStart) {
    const t = (mins - aEnd) / (eStart - aEnd);
    return { transition: true, from: 'afternoon', to: 'evening', t };
  }

  // ── Evening (wraps midnight: eStart … midnight … eEnd) ─
  // eEnd is something like 05:59 — it's always < eStart numerically
  if (mins >= eStart || mins <= eEnd) {
    return { transition: false, period: 'evening' };
  }

  // ── Evening → Morning transition ──────────────────────
  // Tiny window between eEnd and mStart (e.g. 05:59–06:00)
  const transitionWindow = mStart - eEnd;
  const t = transitionWindow > 0 ? (mins - eEnd) / transitionWindow : 1;
  return { transition: true, from: 'evening', to: 'morning', t };
}

// ─── Gradient Builder ─────────────────────────────────────────────────────────

/**
 * Given a preset and a date, compute the gradient stops that should be rendered.
 * Call this inside useMemo keyed on the current minute.
 */
export function resolveGradient(date: Date, preset: TimeThemePreset): GradientOutput {
  const periodState = getPeriodState(date, preset);

  let stops: ThemeStop[];
  if (periodState.transition) {
    stops = lerpStops(
      preset[periodState.from].stops,
      preset[periodState.to].stops,
      periodState.t,
    );
  } else {
    stops = preset[periodState.period].stops;
  }

  // Find the "Horizon" stop by name — this is where the animated dots spawn.
  // Falls back to midpoint/white if the stop is missing.
  const horizonStop = stops.find((s) => s.name === 'Horizon') ?? stops[Math.floor(stops.length / 2)];
  const horizonPct   = horizonStop ? horizonStop.pos / 100 : 0.5;
  const horizonColor = horizonStop ? horizonStop.color : '#888888';
  const dots = preset.dots ?? fallbackDotsConfig(preset);

  return {
    colors: stops.map((s) => s.color),
    locations: stops.map((s) => s.pos / 100),
    deg: preset.global.deg,
    periodState,
    horizonPct,
    horizonColor,
    global: preset.global,
    dots,
  };
}

export function resolveGradientForPeriod(
  preset: TimeThemePreset,
  period: PeriodName,
): GradientOutput {
  const stops = preset[period].stops;
  const horizonStop = stops.find((s) => s.name === 'Horizon') ?? stops[Math.floor(stops.length / 2)];
  const horizonPct = horizonStop ? horizonStop.pos / 100 : 0.5;
  const horizonColor = horizonStop ? horizonStop.color : '#888888';
  const dots = preset.dots ?? fallbackDotsConfig(preset);

  return {
    colors: stops.map((s) => s.color),
    locations: stops.map((s) => s.pos / 100),
    deg: preset.global.deg,
    periodState: { transition: false, period },
    horizonPct,
    horizonColor,
    global: preset.global,
    dots,
  };
}

export function getGradientEndpoints(deg: number) {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  const rad = (normalizedDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const scale = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), Number.EPSILON);

  return {
    x1: 0.5 - dx * scale,
    y1: 0.5 - dy * scale,
    x2: 0.5 + dx * scale,
    y2: 0.5 + dy * scale,
  };
}
