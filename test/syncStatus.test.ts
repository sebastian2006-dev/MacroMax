/**
 * @file syncStatus.test.ts
 * Unit tests for the REAL src/lib/syncStatus.ts pub/sub store that drives
 * the header data-source pill (online / local / cached / mixed / offline).
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getSyncStatus,
  reportSearchSources,
  subscribeSyncStatus,
  type SyncSource,
} from "../src/lib/syncStatus";

describe("syncStatus store", () => {
  it("starts in the idle state", () => {
    assert.equal(getSyncStatus().mode, "idle");
    assert.equal(getSyncStatus().label, "Ready");
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeSyncStatus((state) => seen.push(state.mode));
    reportSearchSources(["fatsecret"], { remoteAttempted: true, remoteFailed: false });
    assert.deepEqual(seen, ["online"]);
    unsubscribe();
    reportSearchSources(["fallback"], { remoteAttempted: false, remoteFailed: false });
    assert.deepEqual(seen, ["online"], "unsubscribed listener must not fire");
  });
});

describe("reportSearchSources() — mode resolution", () => {
  const remote = (sources: SyncSource[], remoteFailed = false) =>
    reportSearchSources(sources, { remoteAttempted: true, remoteFailed });

  it("online: remote providers only", () => {
    remote(["fatsecret"]);
    assert.equal(getSyncStatus().mode, "online");
    assert.equal(getSyncStatus().label, "Online");
  });

  it("online: Open Food Facts only", () => {
    remote(["open_food_facts"]);
    assert.equal(getSyncStatus().mode, "online");
  });

  it("mixed: remote + local sources together", () => {
    remote(["fatsecret", "custom_recipe"]);
    assert.equal(getSyncStatus().mode, "mixed");
    assert.equal(getSyncStatus().label, "Local + Online");
  });

  it("local: saved dishes / fallback without a remote attempt", () => {
    reportSearchSources(["custom_recipe"], { remoteAttempted: false, remoteFailed: false });
    assert.equal(getSyncStatus().mode, "local");
    assert.equal(getSyncStatus().label, "Local");
  });

  it("cached: only the on-device cache contributed results", () => {
    reportSearchSources(["local_cache"], { remoteAttempted: false, remoteFailed: false });
    assert.equal(getSyncStatus().mode, "cached");
    assert.equal(getSyncStatus().label, "Cached");
  });

  it("offline: every remote attempt failed", () => {
    remote(["custom_recipe", "fallback"], true);
    assert.equal(getSyncStatus().mode, "offline");
    assert.equal(getSyncStatus().label, "Offline");
  });

  it("offline even when the cache has entries, if remote failed", () => {
    remote(["local_cache", "custom_recipe"], true);
    assert.equal(getSyncStatus().mode, "offline");
  });

  it("mixed: remote succeeded alongside fallback data", () => {
    remote(["fatsecret", "fallback"], true); // remoteFailed only counts when NO remote source succeeded
    assert.equal(getSyncStatus().mode, "mixed");
  });

  it("idle: no sources and nothing attempted", () => {
    reportSearchSources([], { remoteAttempted: false, remoteFailed: false });
    assert.equal(getSyncStatus().mode, "idle");
  });

  it("reports carry a human label, detail and timestamp", () => {
    reportSearchSources(["fatsecret"], { remoteAttempted: true, remoteFailed: false });
    const state = getSyncStatus();
    assert.equal(state.mode, "online");
    assert.ok(state.label.length > 0);
    assert.ok(state.detail.length > 0);
    assert.ok(state.lastUpdated > 0);
  });
});
