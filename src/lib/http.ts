/**
 * Shared network helpers for the food provider clients.
 *
 * Every provider call goes through fetchWithTimeout so a dead network can
 * never leave a search hanging, and each provider is wrapped in safeResolve
 * so a failure degrades to the next source instead of crashing the UI.
 */

export const REMOTE_TIMEOUT_MS = 7000;

/**
 * fetch() wrapper with a hard timeout (AbortController). Rejects when the
 * request cannot complete in time.
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs: number = REMOTE_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Run an async producer, swallowing failures into the provided fallback. */
export async function safeResolve<T>(producer: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await producer();
  } catch (error) {
    console.warn("Food lookup step failed", error);
    return fallback;
  }
}

/** Minimal ASCII base64 encoder (RN/Hermes does not guarantee btoa). */
export function toBase64(value: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < value.length; i += 3) {
    const byte1 = value.charCodeAt(i) & 0xff;
    const byte2 = i + 1 < value.length ? value.charCodeAt(i + 1) & 0xff : 0;
    const byte3 = i + 2 < value.length ? value.charCodeAt(i + 2) & 0xff : 0;
    const triplet = (byte1 << 16) | (byte2 << 8) | byte3;
    output += chars[(triplet >> 18) & 0x3f];
    output += chars[(triplet >> 12) & 0x3f];
    output += i + 1 < value.length ? chars[(triplet >> 6) & 0x3f] : "=";
    output += i + 2 < value.length ? chars[triplet & 0x3f] : "=";
  }
  return output;
}

/** Parse a JSON payload defensively; returns null on any failure. */
export async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    console.warn("Failed to parse JSON response", error);
    return null;
  }
}

/** Parse a numeric string/number safely (0 when missing/invalid). */
export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
