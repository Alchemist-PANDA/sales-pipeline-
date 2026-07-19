/**
 * Credential validation — confirm a key works WITHOUT wasting enrichment credits.
 *
 * Uses each provider's free account/quota endpoint (via the ApiConnector
 * adapter's `validate()`), never an enrichment call. Results are cached per
 * (platform, credential-hash) with a TTL so repeated validation is free and does
 * not re-hit the provider. Validation is a real network call, so it is only
 * performed when the server is configured for live traffic (LIVE_MODE=true);
 * otherwise it reports that clearly instead of pretending.
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getApiAdapter, hasApiAdapter, credentialsFor, ValidationResult } from '../connectors/api.js';
import { hasScraperSupport } from '../scrapers/platforms/index.js';

interface CacheEntry { result: ProviderValidation; at: number; }

export interface ProviderValidation {
  platformId: string;
  connectedAccounts: number;
  status: 'ok' | 'failed' | 'unsupported' | 'not_live' | 'no_credential';
  detail: string;
  quotaRemaining?: number;
  cheap?: boolean;
  cached?: boolean;
}

const TTL_MS = 30 * 60_000; // 30 min

export class CredentialValidator {
  private cache = new Map<string, CacheEntry>();
  constructor(private db: Database.Database) {}

  private hashOf(creds: Record<string, unknown> | null): string {
    return crypto.createHash('sha1').update(JSON.stringify(creds ?? {})).digest('hex').slice(0, 16);
  }

  /** Validate one platform's credential (uses the first connected account's key). */
  async validatePlatform(platformId: string): Promise<ProviderValidation> {
    const accounts = this.db.prepare(
      `SELECT id FROM accounts WHERE platform_id=? AND status='connected' ORDER BY id LIMIT 1`,
    ).all(platformId) as { id: number }[];
    const connectedAccounts = (this.db.prepare(
      `SELECT COUNT(*) n FROM accounts WHERE platform_id=? AND status='connected'`,
    ).get(platformId) as any).n as number;

    if (!accounts.length) {
      return { platformId, connectedAccounts: 0, status: 'no_credential', detail: 'No connected account for this provider.' };
    }

    const adapter = getApiAdapter(platformId);
    if (!adapter?.validate) {
      const kind = hasScraperSupport(platformId) ? 'scraper platform (validated by a live scrape, not a key check)' : 'no cheap validation endpoint';
      return { platformId, connectedAccounts, status: 'unsupported', detail: `Cannot cheaply validate — ${kind}.` };
    }

    if (process.env.LIVE_MODE !== 'true') {
      return { platformId, connectedAccounts, status: 'not_live', detail: 'Validation makes a real (free) account call; enable LIVE_MODE to run it.' };
    }

    const creds = credentialsFor({ id: accounts[0].id } as any);
    const cacheKey = `${platformId}:${this.hashOf(creds)}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.result, cached: true };

    let vr: ValidationResult;
    try {
      vr = await adapter.validate(creds ?? {});
    } catch (e: any) {
      vr = { ok: false, detail: `validation error: ${e?.message ?? 'unknown'}`, cheap: true };
    }
    const result: ProviderValidation = {
      platformId, connectedAccounts,
      status: vr.ok ? 'ok' : 'failed',
      detail: vr.detail, quotaRemaining: vr.quotaRemaining, cheap: vr.cheap,
    };
    this.cache.set(cacheKey, { result, at: Date.now() });

    // Reflect the outcome on account health so the pool router can react.
    this.db.prepare(`UPDATE accounts SET status=?, last_tested_at=datetime('now') WHERE platform_id=? AND status IN ('connected','error')`)
      .run(vr.ok ? 'connected' : 'error', platformId);

    return result;
  }

  /** Validate every provider that has at least one connected account + an adapter. */
  async validateAll(): Promise<{ mode: string; results: ProviderValidation[] }> {
    const platforms = (this.db.prepare(
      `SELECT DISTINCT platform_id FROM accounts WHERE status='connected'`,
    ).all() as { platform_id: string }[]).map((r) => r.platform_id);

    const results: ProviderValidation[] = [];
    for (const p of platforms) {
      if (hasApiAdapter(p) || hasScraperSupport(p)) results.push(await this.validatePlatform(p));
    }
    return { mode: process.env.LIVE_MODE === 'true' ? 'live' : 'test', results };
  }
}
