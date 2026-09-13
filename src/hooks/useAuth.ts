import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LOCAL_USER_ID } from "@/src/lib/db";
import {
  ensureAuthLoaded,
  getAuthState,
  setStoredName,
  subscribeToAuth,
} from "@/src/lib/authStore";

export type { AuthState } from "@/src/lib/authStore";

/**
 * Reads the local (no-account) "session" from the shared auth store.
 *
 * Deliberately NOT focus-dependent: the store is loaded once on mount, so the
 * first screen to render always leaves `initializing` behind — the old
 * `useFocusEffect`-only version could sit on a spinner if focus never arrived.
 */
export function useAuth() {
  const snapshot = useSyncExternalStore(subscribeToAuth, getAuthState, getAuthState);

  useEffect(() => {
    void ensureAuthLoaded();
  }, []);

  const setName = useCallback(async (nextName: string) => {
    await setStoredName(nextName);
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
  };
}
