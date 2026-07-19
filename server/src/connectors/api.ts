/**
 * ApiConnector — the LIVE path for API-key providers.
 *
 * This is what makes "enter a key and it works" true. In live mode, the pooled
 * account's credential is decrypted and used to make a REAL HTTP call to the
 * provider. Two hard rules keep it credible and safe:
 *   1. It is NEVER used in test mode (connector selection gates on mode).
 *   2. In live mode it returns REAL data or NOTHING — it never fabricates. A
 *      missing key, an unimplemented adapter, or an error yields empty evidence
 *      (the waterfall simply moves on); synthetic data only ever comes from the
 *      explicit demo connector in test mode.
 *
 * Adapters are per-provider request/response mappings against each API's
 * documented shape. `validate()` uses a provider's free account/quota endpoint
 * where one exists, so credentials can be checked WITHOUT spending enrichment
 * credits.
 */

import { Connector, EnrichInput, EnrichOutput } from './base.js';
import type { AccountRow } from '../core/pool.js';
import { open as vaultOpen } from '../core/vault.js';
import { db } from '../db/index.js';

export interface ValidationResult {
  ok: boolean;
  detail: string;
  quotaRemaining?: number;
  cheap: boolean; // true when checked via a free account endpoint (no credit spent)
}

export interface ApiAdapter {
  platformId: string;
  /** Live enrichment. Returns real fields/evidence, or empty on miss/error. */
  enrich?(input: EnrichInput, creds: Record<string, unknown>): Promise<EnrichOutput>;
  /** Cheap credential check via a free account/quota endpoint, if the API has one. */
  validate?(creds: Record<string, unknown>): Promise<ValidationResult>;
}

const TIMEOUT_MS = 12_000;

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ── Provider adapters ────────────────────────────────────────────────────────

const hunter: ApiAdapter = {
  platformId: 'hunter',
  async validate(creds) {
    const key = str(creds.apiKey);
    if (!key) return { ok: false, detail: 'missing API key', cheap: true };
    const { status, json } = await fetchJson(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`);
    if (status === 200 && json?.data) {
      const used = json.data.requests?.searches?.used ?? 0;
      const avail = json.data.requests?.searches?.available ?? undefined;
      return { ok: true, detail: `Hunter account OK${avail != null ? ` (${used}/${avail} searches used)` : ''}`, quotaRemaining: avail != null ? avail - used : undefined, cheap: true };
    }
    return { ok: false, detail: `Hunter rejected the key (HTTP ${status})`, cheap: true };
  },
  async enrich(input, creds) {
    const key = str(creds.apiKey);
    const domain = input.domain || `${input.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    if (!key) return { evidence: [] };
    const { status, json } = await fetchJson(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=1&api_key=${encodeURIComponent(key)}`);
    if (status !== 200 || !json?.data) return { evidence: [], rateLimited: status === 429 };
    const first = json.data.emails?.[0];
    return {
      email: first?.value,
      emailStatus: first?.verification?.status === 'valid' ? 'verified' : first ? 'unknown' : undefined,
      linkedin: first?.linkedin || undefined,
      industry: json.data.industry || undefined,
      evidence: json.data.organization ? [`Hunter: ${json.data.organization}${json.data.industry ? ` (${json.data.industry})` : ''}`] : [],
    };
  },
};

const prospeo: ApiAdapter = {
  platformId: 'prospeo',
  async validate(creds) {
    const key = str(creds.apiKey);
    if (!key) return { ok: false, detail: 'missing API key', cheap: true };
    const { status, json } = await fetchJson('https://api.prospeo.io/account-information', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KEY': key }, body: '{}',
    });
    if (status === 200 && json && !json.error) {
      const remaining = json.response?.remaining_credits ?? json.remaining_credits;
      return { ok: true, detail: 'Prospeo account OK', quotaRemaining: typeof remaining === 'number' ? remaining : undefined, cheap: true };
    }
    return { ok: false, detail: `Prospeo rejected the key (HTTP ${status})`, cheap: true };
  },
  async enrich(input, creds) {
    const key = str(creds.apiKey);
    const domain = input.domain || `${input.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    if (!key) return { evidence: [] };
    const { status, json } = await fetchJson('https://api.prospeo.io/domain-search', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KEY': key },
      body: JSON.stringify({ company: domain, limit: 1 }),
    });
    if (status !== 200 || json?.error) return { evidence: [], rateLimited: status === 429 };
    const first = json.response?.email_list?.[0] ?? json.response?.emails?.[0];
    return {
      email: first?.email,
      emailStatus: first?.verification === 'DELIVERABLE' || first?.email_status === 'valid' ? 'verified' : first ? 'unknown' : undefined,
      evidence: json.response?.company_name ? [`Prospeo: ${json.response.company_name}`] : [],
    };
  },
};

const anymailfinder: ApiAdapter = {
  platformId: 'anymailfinder',
  async enrich(input, creds) {
    const key = str(creds.apiKey);
    const domain = input.domain || `${input.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    if (!key) return { evidence: [] };
    const { status, json } = await fetchJson('https://api.anymailfinder.com/v5.0/search/company.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ domain }),
    });
    if (status !== 200) return { evidence: [], rateLimited: status === 429 };
    const email = json?.results?.emails?.[0] || json?.email;
    return { email, emailStatus: email ? (json?.validation === 'valid' ? 'verified' : 'unknown') : undefined, evidence: [] };
  },
};

const findymail: ApiAdapter = {
  platformId: 'findymail',
  async validate(creds) {
    const key = str(creds.apiKey);
    if (!key) return { ok: false, detail: 'missing API key', cheap: true };
    const { status, json } = await fetchJson('https://app.findymail.com/api/credits', { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (status === 200) return { ok: true, detail: 'FindyMail account OK', quotaRemaining: typeof json?.credits === 'number' ? json.credits : undefined, cheap: true };
    return { ok: false, detail: `FindyMail rejected the key (HTTP ${status})`, cheap: true };
  },
};

const apollo: ApiAdapter = {
  platformId: 'apollo',
  async enrich(input, creds) {
    const key = str(creds.apiKey);
    const domain = input.domain || `${input.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    if (!key) return { evidence: [] };
    const { status, json } = await fetchJson('https://api.apollo.io/v1/organizations/enrich', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
      body: JSON.stringify({ domain }),
    });
    if (status !== 200 || !json?.organization) return { evidence: [], rateLimited: status === 429 };
    const o = json.organization;
    return {
      linkedin: o.linkedin_url || undefined,
      industry: o.industry || undefined,
      employeeCount: typeof o.estimated_num_employees === 'number' ? o.estimated_num_employees : undefined,
      location: [o.city, o.state, o.country].filter(Boolean).join(', ') || undefined,
      evidence: o.short_description ? [`Apollo: ${String(o.short_description).slice(0, 200)}`] : [],
    };
  },
};

const ADAPTERS: Record<string, ApiAdapter> = {
  hunter, prospeo, anymailfinder, findymail, apollo,
};

export function hasApiAdapter(platformId: string): boolean {
  return !!ADAPTERS[platformId];
}

export function getApiAdapter(platformId: string): ApiAdapter | undefined {
  return ADAPTERS[platformId];
}

/** Decrypt a leased account's stored credential blob. */
export function credentialsFor(account: AccountRow | null): Record<string, unknown> | null {
  if (!account) return null;
  try {
    const row = db.prepare(`SELECT secret_sealed FROM accounts WHERE id=?`).get(account.id) as { secret_sealed: string | null } | undefined;
    if (!row?.secret_sealed) return null;
    return vaultOpen(row.secret_sealed);
  } catch {
    return null;
  }
}

export class ApiConnector implements Connector {
  constructor(public platformId: string) {}

  async enrich(input: EnrichInput, account: AccountRow | null): Promise<EnrichOutput> {
    const adapter = ADAPTERS[this.platformId];
    if (!adapter?.enrich) return { evidence: [] }; // no live path → contribute nothing (never fabricate)
    const creds = credentialsFor(account);
    if (!creds) return { evidence: [] };            // no key → contribute nothing
    try {
      return await adapter.enrich(input, creds);
    } catch {
      return { evidence: [], rateLimited: false };
    }
  }
}
