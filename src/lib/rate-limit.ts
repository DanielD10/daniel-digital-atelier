/**
 * Fixed-window rate limiter held in process memory.
 *
 * Honest caveat: on Vercel each serverless instance keeps its own
 * counter, so a determined attacker spreading requests across cold
 * instances gets more than the stated limit. This is enough to stop
 * a bored visitor hammering the contact form. If the form ever gets
 * abused for real, move this to Upstash Redis — the interface below
 * is deliberately easy to swap.
 */

type Entry = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const MAX_TRACKED_KEYS = 5_000;

const hits = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
};

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();

  // Cheap guard against unbounded memory growth.
  if (hits.size > MAX_TRACKED_KEYS) sweep(now);

  const existing = hits.get(key);

  if (!existing || existing.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return {
      allowed: true,
      remaining: MAX_REQUESTS - 1,
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, retryAfter };
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS - existing.count,
    retryAfter,
  };
}

/**
 * Best-effort client IP. Vercel sets x-forwarded-for; the first entry
 * is the real client. Falls back to a shared bucket so a missing
 * header degrades to "everyone shares one limit" rather than "no limit".
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
