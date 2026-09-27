import {
  getAppPref,
  getProfile,
  resetDbConnection,
  saveProfileName,
  setAppPref,
  setOnboardingComplete,
  USER_PREF_KEYS,
} from "@/src/lib/db";

/**
 * The one place the "who is using this device" answer lives.
 *
 * Identity (display name + onboarding flag) is persisted in SQLite NEXT TO the
 * food logs — the name in the `profile` row, flags in `user_prefs` — so it
 * survives app updates exactly like logged data does. AsyncStorage is gone
 * from the app entirely.
 *
 * Hydration contract (this is the fix for "the app asks for my name after every
 * update"): the auth gate NEVER opens on a guessed state. The old store raced
 * storage against a 3-second timeout and opened the gate with
 * `hasCompletedOnboarding: false` when storage was slow — sending a returning
 * user to the name screen on a cold start, with no way to recover from the
 * wrong route. Now `initializing` stays true until the SQLite read settles
 * (success or failure), RequireAuth holds the branded splash meanwhile, and
 * the settled value is the value the gate acts on.
 *
 * The first frame still never depends on storage: the root layout renders the
 * router immediately, and every gated screen shows the same quiet branded
 * placeholder while `initializing` is true. SQLite answers in milliseconds on
 * device.
 *
 * If the SQLite open itself FAILS, we fail OPEN to the first-run experience
 * rather than spinning forever — and a user who completes onboarding in that
 * state simply re-seeds the fresh DB.
 */

export interface AuthState {
  /** Saved display name, or null when the user has not set one yet. */
  name: string | null;
  /** True once the user has completed the full onboarding flow. */
  hasCompletedOnboarding: boolean;
  /** True until the first SQLite read settles. */
  initializing: boolean;
}

let state: AuthState = { name: null, hasCompletedOnboarding: false, initializing: true };
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

async function readIdentity(): Promise<void> {
  try {
    const [profile, flag] = await Promise.all([getProfile(), getAppPref(USER_PREF_KEYS.onboarding)]);
    const name = profile?.username?.trim() || null;
    setState({
      name,
      hasCompletedOnboarding: flag === "true" && name !== null,
      initializing: false,
    });
  } catch (error) {
    // Fail OPEN: never gate the app behind an unreadable database.
    console.warn("Failed to read identity from SQLite; starting the first-run experience.", error);
    setState({ name: null, hasCompletedOnboarding: false, initializing: false });
  }
}

let loadPromise: Promise<void> | null = null;

/**
 * Starts the initial read exactly once per app launch. Safe to call from every
 * screen — later callers share the promise.
 */
export function ensureAuthLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = readIdentity();
  }
  return loadPromise;
}

/**
 * Persists the display name and publishes it to every subscriber. Writes to
 * the SQLite profile so the name travels with the food data.
 */
export async function setStoredName(nextName: string): Promise<void> {
  const trimmed = nextName.trim();
  await saveProfileName(trimmed);
  setState({ name: trimmed || null });
}

/**
 * Marks onboarding complete (persisted) and refreshes the shared snapshot.
 * Called by the goals step of the onboarding flow, or by the skip path.
 */
export async function completeOnboarding(): Promise<void> {
  await setOnboardingComplete();
  setState({ hasCompletedOnboarding: true, initializing: false });
}

/**
 * Marks just the walkthrough as seen. Kept separate from onboarding so a
 * crash mid-walkthrough never forces the user through the name/goals steps
 * again — only the walkthrough replays.
 */
export async function completeWalkthrough(): Promise<void> {
  await setAppPref(USER_PREF_KEYS.walkthrough, "true");
}

/**
 * Dev/testing helper: forget the onboarding flag and the walkthrough flag so
 * the full first-run experience plays again. Does NOT delete food data.
 */
export async function resetOnboardingForTests(): Promise<void> {
  try {
    await setAppPref(USER_PREF_KEYS.onboarding, "false");
    await setAppPref(USER_PREF_KEYS.walkthrough, "false");
  } catch {
    // Best-effort: the in-memory state below is what tests observe.
  }
  setState({ hasCompletedOnboarding: false });
}

/** Forget the cached promise so the next read re-runs (retry paths/tests). */
export function resetAuthStoreForTests(): void {
  resetDbConnection();
  loadPromise = null;
  state = { name: null, hasCompletedOnboarding: false, initializing: true };
}
