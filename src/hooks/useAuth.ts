import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LOCAL_USER_ID } from "@/src/lib/db";
import {
  completeOnboarding,
  ensureAuthLoaded,
  getAuthState,
  resetOnboardingForTests,
  setStoredName,
  subscribeToAuth,
} from "@/src/lib/authStore";

export type { AuthState } from "@/src/lib/authStore";

/**
 * Reads the local (no-account) "session" from the shared auth store.
 *
 * Deliberately NOT focus-dependent: the store is loaded once on mount, so the
 * first screen to render always leaves `initializing` behind.
 */
export function useAuth() {
  const snapshot = useSyncExternalStore(subscribeToAuth, getAuthState, getAuthState);

  useEffect(() => {
    void ensureAuthLoaded();
  }, []);

  /** Persists the display name to SQLite. */
  const setName = useCallback(async (nextName: string) => {
    await setStoredName(nextName);
  }, []);

  /** Marks the whole onboarding flow complete (persisted, survives restarts). */
  const finishOnboarding = useCallback(async () => {
    await completeOnboarding();
  }, []);

  /** Dev/testing helper: replay the first-run experience. */
  const resetOnboarding = useCallback(async () => {
    await resetOnboardingForTests();
  }, []);

  const session = useMemo(
    () => (snapshot.name ? { user: { id: LOCAL_USER_ID } } : null),
    [snapshot.name]
  );

  return {
    session,
    initializing: snapshot.initializing,
    userId: snapshot.name ? LOCAL_USER_ID : null,
    name: snapshot.name,
    setName,
    hasCompletedOnboarding: snapshot.hasCompletedOnboarding,
    finishOnboarding,
    resetOnboarding,
  };
}
