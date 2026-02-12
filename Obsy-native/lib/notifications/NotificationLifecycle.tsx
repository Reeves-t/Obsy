import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { configureNotificationHandler, refreshLocalNotifications } from './index';
import { useYearInPixelsStore } from '../yearInPixelsStore';
import { getLocalDayKey } from '../utils';

/**
 * Invisible component that manages notification lifecycle.
 * Mount once in the root layout. Handles:
 *   1. Configure notification handler on mount
 *   2. Refresh scheduling on app start
 *   3. Refresh scheduling on app foreground
 *   4. Refresh scheduling when today's pixel changes
 */
export function NotificationLifecycle(): null {
  const appStateRef = useRef(AppState.currentState);
  const prevTodayPixelRef = useRef<string | null>(null);

  // 1. Configure handler + initial refresh on mount (app start)
  useEffect(() => {
    configureNotificationHandler();
    refreshLocalNotifications().catch(console.error);
  }, []);

  // 2. Refresh on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        refreshLocalNotifications().catch(console.error);
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  // 3. Refresh when today's pixel changes (subscribe to store)
  useEffect(() => {
    const unsubscribe = useYearInPixelsStore.subscribe((state) => {
      const todayKey = getLocalDayKey();
      const todayPixel = state.pixels[todayKey];
      const hasColor = !!(
        todayPixel?.color ||
        (todayPixel?.strokes && todayPixel.strokes.length > 0)
      );
      const colorSignature = hasColor ? 'colored' : 'blank';

      // Only refresh if today's pixel state actually changed
      if (prevTodayPixelRef.current !== colorSignature) {
        prevTodayPixelRef.current = colorSignature;
        refreshLocalNotifications().catch(console.error);
      }
    });

    return unsubscribe;
  }, []);

  return null;
}
