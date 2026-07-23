/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * ponytail: in-memory Map = per-instance. On Vercel Fluid Compute instances are
 * reused, so this holds for a low-traffic waitlist. If abuse spans instances,
 * swap the Map for Upstash Redis (@upstash/ratelimit) or put a rule on Vercel
 * Firewall — same call site, different store.
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  { limit, windowMs, now = Date.now() }: { limit: number; windowMs: number; now?: number },
): { ok: boolean; remaining: number } {
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, remaining: 0 };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, remaining: limit - recent.length };
}
