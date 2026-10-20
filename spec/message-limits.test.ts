import { expect, it } from "vitest";
import { IdempotencyCache, RateLimiter, isValidIdempotencyKey } from "../src/message-limits.ts";

it("accepts a bounded, fixed-format idempotency key", () => {
  expect(isValidIdempotencyKey("abc-123_XYZ")).toBe(true);
  expect(isValidIdempotencyKey("a".repeat(64))).toBe(true);
});

it("rejects an idempotency key that is missing, too long, or holds disallowed characters", () => {
  expect(isValidIdempotencyKey(undefined)).toBe(false);
  expect(isValidIdempotencyKey("")).toBe(false);
  expect(isValidIdempotencyKey("a".repeat(65))).toBe(false);
  expect(isValidIdempotencyKey("has a space")).toBe(false);
  expect(isValidIdempotencyKey("has/slash")).toBe(false);
  expect(isValidIdempotencyKey(12345)).toBe(false);
});

it("allows up to 3 sends in the window, then refuses a 4th", () => {
  const limiter = new RateLimiter();
  const now = 1_000_000;
  expect(limiter.recordAndCheck("hash-a", now)).toBe(true);
  expect(limiter.recordAndCheck("hash-a", now + 1000)).toBe(true);
  expect(limiter.recordAndCheck("hash-a", now + 2000)).toBe(true);
  expect(limiter.recordAndCheck("hash-a", now + 3000)).toBe(false);
});

it("a refused send does not itself count toward the window once it falls due to age out", () => {
  const limiter = new RateLimiter();
  const now = 1_000_000;
  limiter.recordAndCheck("hash-a", now);
  limiter.recordAndCheck("hash-a", now + 1000);
  limiter.recordAndCheck("hash-a", now + 2000);
  expect(limiter.recordAndCheck("hash-a", now + 3000)).toBe(false);
  // 10s later, the first three have aged out of the 10s window.
  expect(limiter.recordAndCheck("hash-a", now + 10_001)).toBe(true);
});

it("rate limiting is scoped per identity: one identity's sends never count against another's", () => {
  const limiter = new RateLimiter();
  const now = 1_000_000;
  limiter.recordAndCheck("hash-a", now);
  limiter.recordAndCheck("hash-a", now + 1000);
  limiter.recordAndCheck("hash-a", now + 2000);
  expect(limiter.recordAndCheck("hash-a", now + 3000)).toBe(false);
  expect(limiter.recordAndCheck("hash-b", now + 3000)).toBe(true);
});

it("sweep drops an identity's entry once every one of its sends has aged out", () => {
  const limiter = new RateLimiter();
  const now = 1_000_000;
  limiter.recordAndCheck("hash-a", now);
  expect(limiter.size()).toBe(1);
  limiter.sweep(now + 10_001);
  expect(limiter.size()).toBe(0);
});

it("sweep keeps an identity whose sends are still within the window", () => {
  const limiter = new RateLimiter();
  const now = 1_000_000;
  limiter.recordAndCheck("hash-a", now);
  limiter.sweep(now + 1000);
  expect(limiter.size()).toBe(1);
});

it("idempotency: the same key for the same identity returns the already-created message id", () => {
  const cache = new IdempotencyCache();
  const now = 1_000_000;
  cache.record("hash-a", "key-1", "msg-1", now);
  expect(cache.get("hash-a", "key-1")).toBe("msg-1");
});

it("idempotency is scoped per identity: the same key string for a different identity is a miss", () => {
  const cache = new IdempotencyCache();
  const now = 1_000_000;
  cache.record("hash-a", "key-1", "msg-1", now);
  expect(cache.get("hash-b", "key-1")).toBeUndefined();
});

it("idempotency sweep drops an entry once its TTL has passed", () => {
  const cache = new IdempotencyCache();
  const now = 1_000_000;
  cache.record("hash-a", "key-1", "msg-1", now);
  expect(cache.size()).toBe(1);
  cache.sweep(now + 60_001);
  expect(cache.size()).toBe(0);
  expect(cache.get("hash-a", "key-1")).toBeUndefined();
});

it("idempotency sweep keeps an entry still inside its TTL", () => {
  const cache = new IdempotencyCache();
  const now = 1_000_000;
  cache.record("hash-a", "key-1", "msg-1", now);
  cache.sweep(now + 1000);
  expect(cache.size()).toBe(1);
});
