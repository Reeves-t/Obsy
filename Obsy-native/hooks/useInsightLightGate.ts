// useInsightLightGate.ts
// Gates insight text updates behind the MoodRefreshLight retraction animation.
//
// When a refresh completes, the new text is held until onRetractComplete fires
// from MoodRefreshLight, ensuring the light bloom is visible before the card
// content updates. Also enforces a minimum bloom duration so the light always
// has time to be seen even on fast networks.

import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimum time (ms) the light stays bloomed before retraction starts. */
const MIN_LIGHT_DURATION_MS = 1500;

/**
 * @param isLoading  Whether the store/API is actively loading.
 * @param text       The raw insight text from the store.
 * @returns
 *   - displayText:       The text to render (gated behind retraction).
 *   - lightLoading:      Pass to MoodRefreshLight's `loading` prop.
 *   - onRetractComplete: Pass to MoodRefreshLight's `onRetractComplete` prop.
 */
export function useInsightLightGate(isLoading: boolean, text: string | null) {
  const [displayText, setDisplayText] = useState(text);
  const [lightLoading, setLightLoading] = useState(false);

  const wasLoadingRef = useRef(false);
  const isRetractingRef = useRef(false);
  const latestTextRef = useRef(text);
  const lightStartRef = useRef(0);

  // Always keep a ref to the latest text so onRetractComplete reads the current value
  latestTextRef.current = text;

  // Track loading transitions → bloom / retract
  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true;
      setLightLoading(true);
      lightStartRef.current = Date.now();
    } else if (wasLoadingRef.current) {
      // Loading just ended — hold light for minimum bloom time, then retract
      wasLoadingRef.current = false;
      isRetractingRef.current = true;

      const elapsed = Date.now() - lightStartRef.current;
      const remaining = Math.max(0, MIN_LIGHT_DURATION_MS - elapsed);

      const timer = setTimeout(() => {
        setLightLoading(false); // triggers MoodRefreshLight retraction
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Pass through text directly when outside a loading / retraction cycle
  useEffect(() => {
    if (!isRetractingRef.current && !wasLoadingRef.current) {
      setDisplayText(text);
    }
  }, [text]);

  // Called by MoodRefreshLight when retraction animation finishes
  const handleRetractComplete = useCallback(() => {
    isRetractingRef.current = false;
    setDisplayText(latestTextRef.current);
  }, []);

  return { displayText, lightLoading, onRetractComplete: handleRetractComplete };
}
