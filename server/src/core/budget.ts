export interface ProviderBudget {
  providerId: string;
  maxCallsPerRun: number;
  maxCallsPerHour: number;
  maxCallsPerDay: number;
  maxFailuresPerRun: number;
  maxConsecutiveFailures: number;
  cooldownMinutes: number;
  estimatedCostPerCallUsd?: number;
  maxCostPerRunUsd?: number;
  maxTokensPerRun?: number;
}

export interface BudgetState {
  runCalls: number;
  hourCalls: number;
  dayCalls: number;
  runFailures: number;
  consecutiveFailures: number;
  runCostUsd: number;
  runTokens: number;
  cooldownUntil?: number;
}

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterMs?: number };

export class BudgetGuard {
  private states = new Map<string, BudgetState>();

  constructor(private budgets: ProviderBudget[]) {}

  private config(providerId: string): ProviderBudget {
    const found = this.budgets.find((x) => x.providerId === providerId);
    if (!found) throw new Error(`No budget configured for provider ${providerId}`);
    return found;
  }

  private state(providerId: string): BudgetState {
    if (!this.states.has(providerId)) {
      this.states.set(providerId, {
        runCalls: 0,
        hourCalls: 0,
        dayCalls: 0,
        runFailures: 0,
        consecutiveFailures: 0,
        runCostUsd: 0,
        runTokens: 0,
      });
    }
    return this.states.get(providerId)!;
  }

  canCall(providerId: string, estimatedTokens = 0): BudgetDecision {
    const c = this.config(providerId);
    const s = this.state(providerId);
    const now = Date.now();

    if (s.cooldownUntil && s.cooldownUntil > now)
      return { allowed: false, reason: 'provider is cooling down', retryAfterMs: s.cooldownUntil - now };
    if (s.runCalls >= c.maxCallsPerRun) return { allowed: false, reason: 'run call budget exhausted' };
    if (s.hourCalls >= c.maxCallsPerHour) return { allowed: false, reason: 'hourly call budget exhausted' };
    if (s.dayCalls >= c.maxCallsPerDay) return { allowed: false, reason: 'daily call budget exhausted' };
    if (s.runFailures >= c.maxFailuresPerRun) return { allowed: false, reason: 'run failure budget exhausted' };
    if (s.consecutiveFailures >= c.maxConsecutiveFailures)
      return { allowed: false, reason: 'circuit breaker open due to consecutive failures' };
    if (c.maxTokensPerRun !== undefined && s.runTokens + estimatedTokens > c.maxTokensPerRun)
      return { allowed: false, reason: 'token budget would be exceeded' };
    const estimatedCost = c.estimatedCostPerCallUsd ?? 0;
    if (c.maxCostPerRunUsd !== undefined && s.runCostUsd + estimatedCost > c.maxCostPerRunUsd)
      return { allowed: false, reason: 'cost budget would be exceeded' };

    return { allowed: true };
  }

  record(providerId: string, result: { ok: boolean; tokens?: number; costUsd?: number; rateLimited?: boolean }) {
    const c = this.config(providerId);
    const s = this.state(providerId);
    s.runCalls++;
    s.hourCalls++;
    s.dayCalls++;
    s.runTokens += result.tokens ?? 0;
    s.runCostUsd += result.costUsd ?? c.estimatedCostPerCallUsd ?? 0;

    if (result.ok) {
      s.consecutiveFailures = 0;
    } else {
      s.runFailures++;
      s.consecutiveFailures++;
    }

    if (result.rateLimited || s.consecutiveFailures >= c.maxConsecutiveFailures)
      s.cooldownUntil = Date.now() + c.cooldownMinutes * 60_000;
  }

  snapshot() {
    return Object.fromEntries(this.states.entries());
  }

  resetRun() {
    for (const state of this.states.values()) {
      state.runCalls = 0;
      state.runFailures = 0;
      state.consecutiveFailures = 0;
      state.runCostUsd = 0;
      state.runTokens = 0;
    }
  }
}

export function allocateTokenBudget(totalTokens: number) {
  return {
    eventExtraction: Math.floor(totalTokens * 0.18),
    relevanceClassification: Math.floor(totalTokens * 0.12),
    entityResolution: Math.floor(totalTokens * 0.15),
    verification: Math.floor(totalTokens * 0.20),
    companyEnrichment: Math.floor(totalTokens * 0.15),
    peopleEnrichment: Math.floor(totalTokens * 0.12),
    finalSynthesis: Math.floor(totalTokens * 0.08),
  };
}
