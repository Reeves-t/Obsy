// Source of truth for the Obsy Default aurora background's base color.
// The 4 orbs (cyan/blue, mix-blend-mode: screen) glow over a DARK canvas, so
// every palette here is a deep tint — keeps the orbs vivid and light text readable.
// The orbs themselves are never recolored; only this base gradient changes.

export type AuroraBackgroundKey = 'default' | 'black' | 'pink' | 'tan';

interface AuroraPalette {
  label: string;
  radial: [string, string, string]; // glow -> mid -> base
  linear: [string, string];
  fallback: string;
  swatch: string; // picker dot (slightly lifted for legibility)
}

export const AURORA_BACKGROUNDS: Record<AuroraBackgroundKey, AuroraPalette> = {
  default: { label: 'Navy', radial: ['#0e1530', '#070a16', '#04060d'], linear: ['#05070d', '#060914'], fallback: '#04060d', swatch: '#1b2a52' },
  black: { label: 'Black', radial: ['#141414', '#080808', '#000000'], linear: ['#050505', '#000000'], fallback: '#000000', swatch: '#1c1c1c' },
  pink: { label: 'Pink', radial: ['#2a0f1e', '#170812', '#0a040a'], linear: ['#0c0509', '#0a040a'], fallback: '#0a040a', swatch: '#5a2740' },
  tan: { label: 'Tan', radial: ['#28201a', '#150f0a', '#0a0805'], linear: ['#0b0805', '#0a0805'], fallback: '#0a0805', swatch: '#5a4630' },
};

export const AURORA_BACKGROUND_ORDER: AuroraBackgroundKey[] = ['default', 'black', 'pink', 'tan'];

export const isAuroraBackgroundKey = (value: unknown): value is AuroraBackgroundKey =>
  value === 'default' || value === 'black' || value === 'pink' || value === 'tan';

// CSS value matching the .bg-stage background (two stacked layers).
export const auroraGradientCss = (key: AuroraBackgroundKey): string => {
  const p = AURORA_BACKGROUNDS[key] ?? AURORA_BACKGROUNDS.default;
  return (
    `radial-gradient(140% 90% at 50% 110%, ${p.radial[0]} 0%, ${p.radial[1]} 45%, ${p.radial[2]} 100%), ` +
    `linear-gradient(180deg, ${p.linear[0]} 0%, ${p.linear[1]} 100%)`
  );
};
