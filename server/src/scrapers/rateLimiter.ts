/**
 * Politeness layer for self-hosted scraping. No paid gateway means WE are
 * responsible for not hammering target sites — this is what keeps the 30
 * owner accounts from getting IP/rate-limit banned.
 *
 * Per-platform: a minimum jittered delay between requests + a concurrency cap.
 * Simple, in-memory, single-process — sufficient for a 30-person team's volume.
 */

interface Limiter {
  lastRun: number;
  inFlight: number;
}

const limiters = new Map<string, Limiter>();

const DEFAULTS = { minDelayMs: 1500, jitterMs: 1200, maxConcurrent: 2 };

/** Per-platform overrides — slower for sites known to be sensitive to bots. */
const OVERRIDES: Record<string, Partial<typeof DEFAULTS>> = {
  linkedin: { minDelayMs: 4000, jitterMs: 3000, maxConcurrent: 1 },
  glassdoor: { minDelayMs: 3000, jitterMs: 2000, maxConcurrent: 1 },
  google_business: { minDelayMs: 800, jitterMs: 600, maxConcurrent: 3 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for a slot, run `fn`, release. Enforces min delay + concurrency cap. */
export async function throttled<T>(platformId: string, fn: () => Promise<T>): Promise<T> {
  const cfg = { ...DEFAULTS, ...OVERRIDES[platformId] };
  let state = limiters.get(platformId);
  if (!state) {
    state = { lastRun: 0, inFlight: 0 };
    limiters.set(platformId, state);
  }

  while (state.inFlight >= cfg.maxConcurrent) await sleep(150);
  state.inFlight++;
  try {
    const elapsed = Date.now() - state.lastRun;
    const wait = cfg.minDelayMs + Math.random() * cfg.jitterMs - elapsed;
    if (wait > 0) await sleep(wait);
    state.lastRun = Date.now();
    return await fn();
  } finally {
    state.inFlight--;
  }
}
