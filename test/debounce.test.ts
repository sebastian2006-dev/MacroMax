/**
 * @file debounce.test.ts
 * Unit tests for the pure debounce primitive behind `useDebouncedValue` /
 * the search input. Uses Node's built-in mock timers, so no real waiting.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDebouncer, DEFAULT_DEBOUNCE_MS } from "../src/lib/debounce";

describe("DEFAULT_DEBOUNCE_MS", () => {
  it("sits inside the 300–500 ms spec window", () => {
    assert.ok(DEFAULT_DEBOUNCE_MS >= 300, `expected >= 300, got ${DEFAULT_DEBOUNCE_MS}`);
    assert.ok(DEFAULT_DEBOUNCE_MS <= 500, `expected <= 500, got ${DEFAULT_DEBOUNCE_MS}`);
  });
});

describe("createDebouncer()", () => {
  it("does not fire before the delay has elapsed", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const calls: string[] = [];
    const debouncer = createDebouncer<[string]>((value) => calls.push(value), 300);

    debouncer.call("a");
    t.mock.timers.tick(299);
    assert.deepEqual(calls, []);
    t.mock.timers.tick(1);
    assert.deepEqual(calls, ["a"]);
    t.mock.timers.reset();
  });

  it("collapses a burst of calls into ONE trailing invocation", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const calls: string[] = [];
    const debouncer = createDebouncer<[string]>((value) => calls.push(value), 350);

    debouncer.call("c");
    t.mock.timers.tick(100);
    debouncer.call("ch");
    t.mock.timers.tick(100);
    debouncer.call("chi");
    t.mock.timers.tick(100);
    debouncer.call("chicken");
    assert.deepEqual(calls, [], "nothing fires while the user is still typing");

    t.mock.timers.tick(350);
    assert.deepEqual(calls, ["chicken"], "only the latest value is emitted, exactly once");
    t.mock.timers.reset();
  });

  it("cancel() drops a pending invocation", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const calls: string[] = [];
    const debouncer = createDebouncer<[string]>((value) => calls.push(value), 300);

    debouncer.call("a");
    debouncer.cancel();
    t.mock.timers.tick(1000);
    assert.deepEqual(calls, []);
    assert.equal(debouncer.pending, false);
    t.mock.timers.reset();
  });

  it("flush() runs the pending invocation immediately and cancels its timer", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const calls: string[] = [];
    const debouncer = createDebouncer<[string]>((value) => calls.push(value), 300);

    debouncer.call("now");
    debouncer.flush();
    assert.deepEqual(calls, ["now"]);
    t.mock.timers.tick(1000);
    assert.deepEqual(calls, ["now"], "must not fire a second time from the old timer");
    t.mock.timers.reset();
  });

  it("pending reflects whether an invocation is queued", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const debouncer = createDebouncer<[]>((() => {}) as () => void, 300);

    assert.equal(debouncer.pending, false);
    debouncer.call();
    assert.equal(debouncer.pending, true);
    t.mock.timers.tick(300);
    assert.equal(debouncer.pending, false);
    t.mock.timers.reset();
  });
});
