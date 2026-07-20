import { create } from 'zustand';

// Cross-tree signal so an insight refresh can make the background Aurora
// "breathe" a mood-tinted light up from the bottom. The refresh button lives
// deep in an insight card while the Aurora sits up in ScreenWrapper, so a tiny
// store is the simplest bridge.
//
// `activeCount` is a refcount — the Aurora breathes the light OUT while it's > 0
// and breathes it back IN once it returns to 0. A refcount (rather than a bool)
// keeps things correct if more than one card ever refreshes at once.
// `color` is the dominant mood color (hex) used to tint the bottom glow.
interface AuroraBreathState {
  activeCount: number;
  color: string | null;
  /** Start a breath, optionally tinting it with a mood color. */
  begin: (color: string | null) => void;
  /** Release a breath; the light settles back once the count hits 0. */
  end: () => void;
}

export const useAuroraBreathStore = create<AuroraBreathState>((set) => ({
  activeCount: 0,
  color: null,
  begin: (color) =>
    set((s) => ({ activeCount: s.activeCount + 1, color: color ?? s.color })),
  end: () => set((s) => ({ activeCount: Math.max(0, s.activeCount - 1) })),
}));
