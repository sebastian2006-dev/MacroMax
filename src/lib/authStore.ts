import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The one place the "who is using this device" answer lives.
 *
 * Before this existed every `useAuth()` call kept its own copy of the state and
 * only refreshed it from a `useFocusEffect`, so each screen instance could be
 * stuck at `initializing: true` until it happened to gain focus — and saving a
 * name on one screen left the others stale. A module-level store fixes both:
 * the value is read once per app launch, every hook instance subscribes to the
 * same snapshot, and `initializing` is guaranteed to settle (success *or*
 * failure) so a gate can never spin forever.
 */

const NAME_KEY = "@macromax/name";

export interface AuthState {
  /** Saved display name, or null when the user has not set one yet. */
  name: string | null;
  /** True until the first storage read settles. */
  initializing: boolean;
}

let state: AuthState = { name: null, initializing: true };
const listeners = new Set<() => void>();

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

/** Stable snapshot for `useSyncExternalStore`. */
export function getAuthState(): AuthState {
  return state;
}

export function subscribeToAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Upper bound on the very first storage read. AsyncStorage answers in
 * milliseconds, but the first paint must not depend on it answering at all: if
 * it is slower than this, the app opens on the (empty) first-run experience and
 * adopts a late value whenever it finally arrives.
 */
const LOAD_TIMEOUT_MS = 3000;

async function readStoredName(): Promise<void> {
  const read = AsyncStorage.getItem(NAME_KEY);

  try {
    const stored = await Promise.race([
      read,
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), LOAD_TIMEOUT_MS);
      }),
    ]);

    setState({ name: stored?.trim() || null, initializing: false });

    if (stored === undefined) {
      // Storage answered after the timeout — adopt it, but leave the gate open.
      void read
        .then((late) => {
          const lateName = late?.trim() || null;
          if (lateName !== state.name) {
            setState({ name: lateName });
          }
        })
        .catch(() => {
          // The rejection is already reported by the catch block below.
        });
    }
  } catch (error) {
    // A storage failure must never leave the app gated behind a spinner: the
    // user gets the (empty) first-run experience instead.
    console.warn(`Failed to read ${NAME_KEY}; starting with an empty profile.`, error);
    setState({ name: null, initializing: false });
  }
}

let loadPromise: Promise<void> | null = null;

/**
 * Starts the initial read exactly once per app launch. Safe to call from every
 * screen (and from module scope of the hook) — later callers share the promise.
 */
export function ensureAuthLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = readStoredName();
  }
  return loadPromise;
}

/** Persists the display name and publishes it to every subscriber. */
export async function setStoredName(nextName: string): Promise<void> {
  const trimmed = nextName.trim();
  await AsyncStorage.setItem(NAME_KEY, trimmed);
  setState({ name: trimmed || null, initializing: false });
}

/** Test/reload helper: forget the cached promise so the next read re-runs. */
export function resetAuthStoreForTests(): void {
  loadPromise = null;
  state = { name: null, initializing: true };
}
