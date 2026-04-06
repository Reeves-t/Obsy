import { useState, useEffect } from 'react';
import { getProfile } from '@/services/profile';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Shared hook for AI-free mode state.
 * Returns `{ aiFreeMode, aiFreeLoading }`.
 *
 * `aiFreeLoading` is true until the profile has been fetched, so screens
 * can guard AI surfaces and avoid a brief flash of enabled AI.
 */
export function useAiFreeMode() {
  const { user } = useAuth();
  const [aiFreeMode, setAiFreeMode] = useState(false);
  const [aiFreeLoading, setAiFreeLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    setAiFreeLoading(true);
    getProfile()
      .then((profile) => {
        if (mounted) setAiFreeMode(!!profile?.ai_free_mode);
      })
      .catch(() => {
        if (mounted) setAiFreeMode(false);
      })
      .finally(() => {
        if (mounted) setAiFreeLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { aiFreeMode, aiFreeLoading };
}
