/**
 * Tiny pub/sub store that tracks where the last food lookup was served from.
 * The app header subscribes to this to show a sync indicator:
 * online (FatSecret / Open Food Facts) vs local (cache, saved dishes,
 * built-in fallback) vs offline (remote unreachable).
 */

export type SyncSource =
  | "fatsecret"
  | "open_food_facts"
  | "local_cache"
  | "custom_recipe"
  | "fallback";

export type SyncMode = "idle" | "local" | "cached" | "online" | "mixed" | "offline";

export interface SyncStatusState {
  mode: SyncMode;
  /** Short label shown in the header pill, e.g. "Online" or "Cached". */
  label: string;
  /** Longer description for accessibility / tooltips. */
  detail: string;
  lastUpdated: number;
}

let current: SyncStatusState = {
  mode: "idle",
  label: "Ready",
  detail: "No lookups yet",
  lastUpdated: 0,
};

const listeners = new Set<(state: SyncStatusState) => void>();

export function getSyncStatus(): SyncStatusState {
  return current;
}

export function subscribeSyncStatus(listener: (state: SyncStatusState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface SyncReportOptions {
  /** Whether a remote API (FatSecret / Open Food Facts) was attempted. */
  remoteAttempted: boolean;
  /** Whether every attempted remote API failed (network error / bad response). */
  remoteFailed: boolean;
}

export function reportSearchSources(sources: SyncSource[], options: SyncReportOptions): void {
  const { remoteAttempted, remoteFailed } = options;
  const hasRemote = sources.includes("fatsecret") || sources.includes("open_food_facts");
  // The local cache mirrors earlier lookups (which may be remote data), so it
  // only flips the indicator to "cached" on its own.
  const hasLocal = sources.some((source) =>
    ["custom_recipe", "fallback"].includes(source)
  );
  const cacheOnly = sources.includes("local_cache") && !hasRemote && !hasLocal;

  const lastUpdated = Date.now();

  if (remoteAttempted && remoteFailed && !hasRemote) {
    current = {
      mode: "offline",
      label: "Offline",
      detail: "Remote food APIs unreachable — showing saved & local data",
      lastUpdated,
    };
  } else if (hasRemote && hasLocal) {
    current = {
      mode: "mixed",
      label: "Local + Online",
      detail: "Saved dishes with FatSecret / Open Food Facts results",
      lastUpdated,
    };
  } else if (hasRemote) {
    current = {
      mode: "online",
      label: "Online",
      detail: "Fetched from FatSecret / Open Food Facts",
      lastUpdated,
    };
  } else if (hasLocal) {
    current = {
      mode: "local",
      label: "Local",
      detail: "Saved dishes & built-in reference foods",
      lastUpdated,
    };
  } else if (cacheOnly) {
    current = {
      mode: "cached",
      label: "Cached",
      detail: "From the on-device food cache",
      lastUpdated,
    };
  } else {
    current = {
      mode: "idle",
      label: "Ready",
      detail: "No lookups yet",
      lastUpdated,
    };
  }

  for (const listener of listeners) {
    listener(current);
  }
}
