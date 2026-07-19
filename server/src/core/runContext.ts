/**
 * Run context — the safety envelope around every room trigger.
 *
 * Two things matter for credibility and not wasting API keys:
 *   1. MODE. `test` makes ZERO external calls — discovery and enrichment run on
 *      deterministic synthetic data + the cache, so the whole workflow can be
 *      exercised end-to-end without spending a single credit. `live` makes real
 *      calls, but only ever inside the budget below.
 *   2. A GLOBAL CEILING. Independent of per-provider budgets, one run can never
 *      exceed maxExternalCalls / maxCostUsd. When the ceiling is hit, remaining
 *      work is skipped (and reported), never silently over-spent.
 *
 * Every external-call site threads a RunContext and calls `charge()` BEFORE the
 * call. `charge()` returns false when the ceiling is reached — the caller must
 * then skip, not call. Cache hits and test-mode synthesis never charge.
 */

export type RunMode = 'test' | 'live';

export interface RunLimits {
  maxExternalCalls: number;
  maxCostUsd: number;
}

export const DEFAULT_RUN_LIMITS: RunLimits = {
  maxExternalCalls: 300,
  maxCostUsd: 10,
};

export interface RunStats {
  mode: RunMode;
  realCalls: number;
  cacheHits: number;
  synthesized: number;      // test-mode synthetic results produced
  skippedByBudget: number;
  failures: number;
  costUsd: number;
  byProvider: Record<string, { calls: number; ok: number; failed: number; cost: number }>;
}

export class RunContext {
  readonly mode: RunMode;
  readonly limits: RunLimits;
  readonly stats: RunStats;

  constructor(mode: RunMode = 'test', limits: Partial<RunLimits> = {}) {
    this.mode = mode === 'live' ? 'live' : 'test';
    this.limits = { ...DEFAULT_RUN_LIMITS, ...limits };
    this.stats = {
      mode: this.mode, realCalls: 0, cacheHits: 0, synthesized: 0,
      skippedByBudget: 0, failures: 0, costUsd: 0, byProvider: {},
    };
  }

  get isTest(): boolean { return this.mode === 'test'; }
  get isLive(): boolean { return this.mode === 'live'; }

  private provider(id: string) {
    return (this.stats.byProvider[id] ??= { calls: 0, ok: 0, failed: 0, cost: 0 });
  }

  /** Would another external call still be within the global ceiling? */
  canSpend(estCostUsd = 0): boolean {
    if (this.stats.realCalls >= this.limits.maxExternalCalls) return false;
    if (this.stats.costUsd + estCostUsd > this.limits.maxCostUsd) return false;
    return true;
  }

  /**
   * Reserve one external call against the global ceiling. Returns false when the
   * ceiling is reached — the caller MUST skip the call. Only for real network
   * calls; cache hits and synthesis do not charge.
   */
  charge(providerId: string, estCostUsd = 0): boolean {
    if (!this.canSpend(estCostUsd)) {
      this.stats.skippedByBudget++;
      return false;
    }
    this.stats.realCalls++;
    this.stats.costUsd += estCostUsd;
    const p = this.provider(providerId);
    p.calls++;
    p.cost += estCostUsd;
    return true;
  }

  recordResult(providerId: string, ok: boolean) {
    const p = this.provider(providerId);
    if (ok) p.ok++; else { p.failed++; this.stats.failures++; }
  }

  recordCacheHit() { this.stats.cacheHits++; }
  recordSynthesized() { this.stats.synthesized++; }

  summary(): RunStats { return this.stats; }
}

/**
 * Resolve the effective mode. A caller may REQUEST live, but we only honor it
 * when the process is allowed to make live calls (LIVE_MODE=true). Otherwise the
 * run is forced to test — a hard guard so a stray `mode:"live"` in a request can
 * never spend keys on a box that was never configured for live traffic.
 */
export function resolveRunMode(requested: unknown): { mode: RunMode; forcedTest: boolean; reason?: string } {
  const wantsLive = requested === 'live';
  const liveAllowed = process.env.LIVE_MODE === 'true';
  if (wantsLive && !liveAllowed) {
    return { mode: 'test', forcedTest: true, reason: 'LIVE_MODE is not enabled on this server; forced to test mode.' };
  }
  return { mode: wantsLive ? 'live' : 'test', forcedTest: false };
}
