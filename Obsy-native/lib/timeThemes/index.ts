import { useEffect, useMemo, useState } from 'react';
import type { TimeThemePreset, GradientOutput } from './types';
import { resolveGradient } from './utils';

export type {
  TimeThemePreset,
  GradientOutput,
  ThemeStop,
  ThemePeriod,
  PeriodName,
  PeriodState,
  ThemeDotsConfig,
  ThemeDotLogic,
  ThemeDotFadeCurve,
  ThemeDotGlowHalo,
  ThemeDotLifetimeMs,
} from './types';
export { getPeriodState, resolveGradient, getGradientEndpoints } from './utils';
export { resolveGradientForPeriod } from './utils';

/**
 * useTimeBasedTheme
 *
 * Returns gradient data for the current time, updated every minute.
 * The gradient smoothly crossfades between periods during transition windows.
 *
 * Usage:
 *   const gradient = useTimeBasedTheme(currentPreset);
 *   // gradient.colors   → string[]  (hex)
 *   // gradient.locations → number[] (0.0–1.0)
 *   // gradient.deg      → number   (degrees, 180 = top→bottom)
 *
 * To swap themes: just pass a different preset. Drop a new preset file into
 * lib/timeThemes/presets/ and import it here or wherever the screen lives.
 */
export function useTimeBasedTheme(preset: TimeThemePreset): GradientOutput {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Tick every minute, aligned to the next minute boundary so updates feel instant
    const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000;
    let interval: ReturnType<typeof setInterval> | null = null;

    const initialTimer = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(initialTimer);
      if (interval) clearInterval(interval);
    };
  }, []);

  return useMemo(() => resolveGradient(now, preset), [now, preset]);
}
