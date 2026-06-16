// useInsightLightGate.ts
// Orchestrates the insight refresh visual: the background Aurora "breathes" a
// mood-tinted light up from the bottom while a refresh is in flight, the old
// insight text fades out, and — right as the light settles back — the new text
// fades in.
//
// The Aurora itself lives up in ScreenWrapper, so we signal it through the
// cross-tree auroraBreathStore. This hook owns all of the timing so the text
// swap stays synchronized with the breath.

import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { useAuroraBreathStore } from '@/lib/auroraBreathStore';

/** A mood's gradient colors. The `primary` tone tints the refresh breath. */
export type MoodLight = {
  /** Dominant/center color of the mood gradient. */
  primary: string;
  /** Transition tone bridging primary → secondary. */
  mid: string;
  /** Shadow/depth color at the outer edge. */
  secondary: string;
};

// Timing — tuned so the bottom light blooms, holds, then settles right as the
// new insight text fades in.
const MIN_BREATH_MS = 1400;   // min time the light stays bloomed (covers fast networks)
const BREATHE_IN_MS = 1300;   // settle duration — matches the Aurora's CSS transition
const TEXT_FADE_OUT_MS = 380; // old text fading out as the breath blooms
const TEXT_FADE_IN_MS = 640;  // new text fading in as the light settles
// Swap the held text partway through the settle so it emerges as the light recedes.
const SWAP_DELAY_MS = Math.max(0, BREATHE_IN_MS - TEXT_FADE_IN_MS);

/**
 * @param isLoading  Whether the store/API is actively loading.
 * @param text       The raw insight text from the store.
 * @param moodColor  Dominant mood color (hex) used to tint the breath.
 * @returns
 *   - displayText:  The text to render (held behind the breath until it settles).
 *   - textOpacity:  Animated opacity to apply to the insight text block.
 */
export function useInsightLightGate(
  isLoading: boolean,
  text: string | null,
  moodColor: string | null = null,
) {
  const [displayText, setDisplayText] = useState(text);
  const textOpacity = useRef(new Animated.Value(1)).current;

  const begin = useAuroraBreathStore((s) => s.begin);
  const end = useAuroraBreathStore((s) => s.end);

  const wasLoadingRef = useRef(false);
  const cyclingRef = useRef(false);     // true from refresh start until the new text is shown
  const breathHeldRef = useRef(false);  // true between begin() and end() (refcount balance)
  const breathStartRef = useRef(0);
  const latestTextRef = useRef(text);
  const moodColorRef = useRef(moodColor);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs current so the deferred callbacks read the latest values.
  latestTextRef.current = text;
  moodColorRef.current = moodColor;

  // Drive the breath + text fade off loading transitions.
  useEffect(() => {
    // Cancel any pending settle/swap from a prior transition.
    if (settleTimerRef.current) { clearTimeout(settleTimerRef.current); settleTimerRef.current = null; }
    if (swapTimerRef.current) { clearTimeout(swapTimerRef.current); swapTimerRef.current = null; }

    if (isLoading) {
      wasLoadingRef.current = true;
      cyclingRef.current = true;
      breathStartRef.current = Date.now();
      // Aurora breathes the light OUT. Guard against double-begin if loading
      // re-fires while a breath is already held.
      if (!breathHeldRef.current) {
        begin(moodColorRef.current);
        breathHeldRef.current = true;
      }
      Animated.timing(textOpacity, {
        toValue: 0,
        duration: TEXT_FADE_OUT_MS,
        useNativeDriver: true,
      }).start();
    } else if (wasLoadingRef.current) {
      // Loading just ended — hold the bloom for a minimum, then settle it back.
      wasLoadingRef.current = false;
      const elapsed = Date.now() - breathStartRef.current;
      const remaining = Math.max(0, MIN_BREATH_MS - elapsed);

      settleTimerRef.current = setTimeout(() => {
        if (breathHeldRef.current) {
          end();                       // Aurora breathes the light back IN
          breathHeldRef.current = false;
        }
        swapTimerRef.current = setTimeout(() => {
          setDisplayText(latestTextRef.current);   // swap to the new insight...
          Animated.timing(textOpacity, {           // ...and fade it in as the light settles
            toValue: 1,
            duration: TEXT_FADE_IN_MS,
            useNativeDriver: true,
          }).start(() => {
            cyclingRef.current = false;
          });
        }, SWAP_DELAY_MS);
      }, remaining);
    }
  }, [isLoading]);

  // Outside a refresh cycle, pass new text straight through.
  useEffect(() => {
    if (!cyclingRef.current) {
      setDisplayText(text);
    }
  }, [text]);

  // Release a held breath / clear timers if we unmount mid-cycle.
  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
      if (breathHeldRef.current) {
        end();
        breathHeldRef.current = false;
      }
    };
  }, [end]);

  return { displayText, textOpacity };
}
