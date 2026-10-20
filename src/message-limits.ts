// Rate limiting and duplicate suppression for chat posts, in memory only
// (same precedent as src/server.ts's listeningByStarId): a restart clears
// both, which is an accepted cost, not a gap — persisting either would be
// the first durable-but-ephemeral-feeling data this app has stored.
//
// Keyed by the identity's token hash, not a star id, since posting the
// Common Room never requires a star.

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_SENDS = 3;
const IDEMPOTENCY_TTL_MS = 60_000;

// Bounded, fixed format: a client-generated value that could grow without
// limit, or hold anything at all, is never accepted. Validated here so the
// same rule governs every caller, not just the one route that happens to
// remember to check it.
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value);
}

export class RateLimiter {
  private sendsByTokenHash = new Map<string, number[]>();

  // Records a send attempt now and reports whether it is allowed. Always
  // prunes this identity's own timestamps to the current window first, so a
  // long-idle identity's entry shrinks back down rather than growing
  // forever, and an identity that has aged out entirely is deleted, not
  // just left at an empty array.
  recordAndCheck(tokenHash: string, now: number): boolean {
    const recent = (this.sendsByTokenHash.get(tokenHash) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX_SENDS) {
      this.sendsByTokenHash.set(tokenHash, recent);
      return false;
    }
    recent.push(now);
    this.sendsByTokenHash.set(tokenHash, recent);
    return true;
  }

  // Drops every identity whose sends have all aged out of the window, so a
  // one-time poster's entry does not sit in memory forever between its own
  // checks. Intended to run on a periodic timer, independent of traffic.
  sweep(now: number): void {
    for (const [tokenHash, sends] of this.sendsByTokenHash) {
      if (!sends.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) this.sendsByTokenHash.delete(tokenHash);
    }
  }

  size(): number {
    return this.sendsByTokenHash.size;
  }
}

// A duplicate send (double-click, a retry after a dropped response) is
// suppressed by a client-chosen idempotency key, scoped to the identity that
// sent it by construction (the map key embeds the token hash), so one
// identity's key can never collide with or suppress another's.
export class IdempotencyCache {
  private seen = new Map<string, { messageId: string; at: number }>();

  private key(tokenHash: string, idempotencyKey: string): string {
    return `${tokenHash}:${idempotencyKey}`;
  }

  get(tokenHash: string, idempotencyKey: string): string | undefined {
    return this.seen.get(this.key(tokenHash, idempotencyKey))?.messageId;
  }

  record(tokenHash: string, idempotencyKey: string, messageId: string, now: number): void {
    this.seen.set(this.key(tokenHash, idempotencyKey), { messageId, at: now });
  }

  // Drops every entry older than the TTL, run on the same periodic timer as
  // RateLimiter.sweep, so a one-time idempotency key does not sit in memory
  // forever once its retry window has long passed.
  sweep(now: number): void {
    for (const [key, entry] of this.seen) {
      if (now - entry.at >= IDEMPOTENCY_TTL_MS) this.seen.delete(key);
    }
  }

  size(): number {
    return this.seen.size;
  }
}
