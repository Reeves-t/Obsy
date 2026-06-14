// Selectable color "waves" for the Obsy Default aurora orbs.
// The 4 orbs use two color families: A drives .s1/.s3, B drives .s2/.s4
// (per-orb alpha stays .70/.75/.55/.50). Only these two RGBs are swappable;
// the orbs' shape, blur, blend, and motion are never touched.
// Values are "r,g,b" channel triplets so they slot into `rgba(var(--orb-a), .70)`.

export type OrbWaveKey = 'aurora' | 'ember' | 'crimson' | 'peach';

interface OrbWave {
  label: string;
  a: string; // s1/s3 family — "r,g,b"
  b: string; // s2/s4 family — "r,g,b"
}

export const ORB_WAVES: Record<OrbWaveKey, OrbWave> = {
  aurora: { label: 'Aurora', a: '17,141,172', b: '65,96,170' },      // cyan + blue (current)
  ember: { label: 'Ember', a: '226,118,46', b: '232,178,74' },        // orange + gold
  crimson: { label: 'Crimson', a: '214,58,82', b: '232,110,114' },    // red + coral
  peach: { label: 'Peach', a: '242,203,168', b: '234,217,194' },      // peach + cream-tan
};

export const ORB_WAVE_ORDER: OrbWaveKey[] = ['aurora', 'ember', 'crimson', 'peach'];

export const isOrbWaveKey = (value: unknown): value is OrbWaveKey =>
  value === 'aurora' || value === 'ember' || value === 'crimson' || value === 'peach';
