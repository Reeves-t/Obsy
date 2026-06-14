import { AURORA_BACKGROUNDS, type AuroraBackgroundKey } from '@/constants/auroraBackgrounds';
import { ORB_WAVES, type OrbWaveKey } from '@/constants/auroraOrbs';

// Shared blended accent for the Obsy Default theme: the channel-average of the
// selected orb wave's primary color and the background swatch. Used by the
// reflective CTA buttons' rim and the carousel subtext glow so they agree.

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const parseTriplet = (rgb: string): [number, number, number] => {
  const p = rgb.split(',').map((s) => parseInt(s.trim(), 10) || 0);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
};

/** "r,g,b" average of the orb wave's primary and the background swatch. */
export const getThemeAccentRgb = (bg: AuroraBackgroundKey, wave: OrbWaveKey): string => {
  const orb = parseTriplet(ORB_WAVES[wave]?.a ?? ORB_WAVES.aurora.a);
  const base = hexToRgb(AURORA_BACKGROUNDS[bg]?.swatch ?? AURORA_BACKGROUNDS.default.swatch);
  return `${Math.round((orb[0] + base[0]) / 2)},${Math.round((orb[1] + base[1]) / 2)},${Math.round((orb[2] + base[2]) / 2)}`;
};
