import { create } from 'zustand';

// Tiny cross-tree signal so the home action carousel can nudge the Aurora
// background's orbs. The carousel lives deep in the home screen while the
// background sits up in ScreenWrapper, so a store is the simplest bridge
// (mirrors the horizonStarsStore / ambientMoodFieldStore pattern).
//
// `pulseId` is a monotonically increasing counter — AuroraBackground subscribes
// to it and, on each change, displaces the orbs to new accumulated positions.
// `lastDirection` is the swipe direction of the most recent move, so the orbs
// can drift sideways the way the user swiped.
type SwipeDirection = 'left' | 'right';

interface AuroraPulseState {
  pulseId: number;
  lastDirection: SwipeDirection;
  pulse: (direction: SwipeDirection) => void;
}

export const useAuroraPulseStore = create<AuroraPulseState>((set) => ({
  pulseId: 0,
  lastDirection: 'left',
  pulse: (direction) => set((s) => ({ pulseId: s.pulseId + 1, lastDirection: direction })),
}));
