/**
 * Proxy pool management.
 *
 * "Where appropriate" is the operative phrase: many of our sources are public
 * and don't need a proxy, so this pool is OPT-IN. Configure it via CRAWL_PROXIES
 * (comma/newline-separated proxy URLs) and, per platform, decide whether to draw
 * from the pool. The pool tracks health per proxy, cools down ones that just got
 * blocked, and rotates round-robin over the healthy remainder.
 *
 *   CRAWL_PROXIES="http://user:pass@host1:8000, http://user:pass@host2:8000"
 *
 * Absent config, the pool is empty and callers fall back to a direct connection
 * (their own IP / owner-session identity), which is the current behavior.
 */

export interface ProxyEndpoint {
  url: string;              // full proxy URL incl. scheme + optional auth
  server: string;           // scheme://host:port for Playwright launch
  username?: string;
  password?: string;
}

interface ProxyHealth {
  endpoint: ProxyEndpoint;
  failures: number;
  cooldownUntil: number;    // epoch ms
  lastUsed: number;
}

function parseProxy(raw: string): ProxyEndpoint | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return {
      url: trimmed,
      server: `${u.protocol}//${u.host}`,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return null;
  }
}

export class ProxyPool {
  private proxies: ProxyHealth[] = [];
  private cursor = 0;
  private readonly cooldownMs = 5 * 60_000;
  private readonly maxFailures = 3;

  constructor(rawConfig?: string) {
    const source = rawConfig ?? process.env.CRAWL_PROXIES ?? '';
    for (const part of source.split(/[\n,]+/)) {
      const ep = parseProxy(part);
      if (ep) this.proxies.push({ endpoint: ep, failures: 0, cooldownUntil: 0, lastUsed: 0 });
    }
  }

  get enabled(): boolean {
    return this.proxies.length > 0;
  }

  get size(): number {
    return this.proxies.length;
  }

  /** Next healthy proxy round-robin, or null if none configured/available. */
  acquire(): ProxyEndpoint | null {
    if (!this.proxies.length) return null;
    const now = Date.now();
    for (let i = 0; i < this.proxies.length; i++) {
      const idx = (this.cursor + i) % this.proxies.length;
      const p = this.proxies[idx];
      if (p.cooldownUntil <= now) {
        this.cursor = (idx + 1) % this.proxies.length;
        p.lastUsed = now;
        return p.endpoint;
      }
    }
    return null; // every proxy is cooling down
  }

  /** Report the outcome of a request that used `url`. Blocks cool a proxy down. */
  report(url: string, outcome: 'ok' | 'blocked' | 'error'): void {
    const p = this.proxies.find((x) => x.endpoint.url === url);
    if (!p) return;
    if (outcome === 'ok') {
      p.failures = 0;
      return;
    }
    p.failures++;
    if (outcome === 'blocked' || p.failures >= this.maxFailures) {
      p.cooldownUntil = Date.now() + this.cooldownMs;
      p.failures = 0;
    }
  }

  /** True when proxies are configured but every one is currently cooling down. */
  get exhausted(): boolean {
    if (!this.proxies.length) return false;
    const now = Date.now();
    return this.proxies.every((p) => p.cooldownUntil > now);
  }

  snapshot() {
    const now = Date.now();
    return {
      configured: this.proxies.length,
      available: this.proxies.filter((p) => p.cooldownUntil <= now).length,
      coolingDown: this.proxies.filter((p) => p.cooldownUntil > now).length,
    };
  }
}

/** Process-wide default pool built from env. */
export const defaultProxyPool = new ProxyPool();
