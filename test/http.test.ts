/**
 * @file http.test.ts
 * Unit tests for the REAL src/lib/http.ts pure helpers used by the provider
 * clients (numeric coercion + ASCII base64 for OAuth Basic auth).
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toBase64, toNumber } from "../src/lib/http";

describe("toNumber()", () => {
  it("passes finite numbers through", () => assert.equal(toNumber(12), 12));
  it("parses numeric strings", () => assert.equal(toNumber("12.5"), 12.5));
  it("parses numeric strings with trailing text", () => assert.equal(toNumber("12.5g"), 12.5));
  it("returns 0 for empty strings", () => assert.equal(toNumber(""), 0));
  it("returns 0 for non-numeric strings", () => assert.equal(toNumber("abc"), 0));
  it("returns 0 for undefined", () => assert.equal(toNumber(undefined), 0));
  it("returns 0 for null", () => assert.equal(toNumber(null), 0));
  it("returns 0 for NaN", () => assert.equal(toNumber(NaN), 0));
  it("returns 0 for Infinity", () => assert.equal(toNumber(Infinity), 0));
  it("parses fatsecret-style serving strings ('100.000')", () =>
    assert.equal(toNumber("100.000"), 100));
});

describe("toBase64()", () => {
  it("encodes ASCII (RFC 4648)", () => assert.equal(toBase64("client:secret"), "Y2xpZW50OnNlY3JldA=="));
  it("encodes 'Hello'", () => assert.equal(toBase64("Hello"), "SGVsbG8="));
  it("handles single-byte input", () => assert.equal(toBase64("a"), "YQ=="));
  it("handles two-byte input", () => assert.equal(toBase64("ab"), "YWI="));
  it("handles empty input", () => assert.equal(toBase64(""), ""));
  it("round-trips through Node's own encoder", () => {
    const sample = "MacroMax/1.0 (contact@example.com)";
    assert.equal(toBase64(sample), Buffer.from(sample, "utf8").toString("base64"));
  });
});
