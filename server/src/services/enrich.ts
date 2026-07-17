/**
 * ============================================================================
 *  ENRICHMENT ORCHESTRATOR  —  waterfall + signal detection + scoring
 * ============================================================================
 *
 *  This is the autonomous pipeline the whole product is named for. For one raw
 *  lead it:
 *    1. WATERFALL-ENRICHES contact/email — tries providers cheapest-first,
 *       each call routed through the account pool (30× throughput), stops as
 *       soon as a verified email is found. A gap in one provider is filled by
 *       the next — exactly the Clay-style waterfall from the playbook.
 *    2. GATHERS SIGNAL EVIDENCE from every signal-source platform (hiring,
 *       funding, tech-stack, reviews, intent…), again pooled.
 *    3. DETECTS SIGNALS by matching evidence against the 60-signal catalog.
 *    4. SCORES the lead 0-100 (fit + signal strength) and routes GEO vs AR.
 *
 *  Every provider call is recorded in enrichment_runs with which owner's
 *  account served it — full attribution for the 30-owner revenue share.
 */

import type Database from 'better-sqlite3';
import { AccountPool } from '../core/pool.js';
import { getConnector } from '../connectors/index.js';
import { PLATFORMS, WATERFALL_ORDER } from '../core/registry.js';
import { SIGNALS, SignalDef } from '../core/signals.js';
import type { EnrichOutput } from '../connectors/base.js';

const SIGNAL_SOURCE_PLATFORMS = PLATFORMS.filter(
  (p) => p.provides.some((c) => c !== 'contact_data'),
).map((p) => p.id);

export interface EnrichResult {
  fields: Partial<{
    email: string;
    email_status: string;
    phone: string;
    linkedin: string;
    industry: string;
    employee_count: number;
    location: string;
  }>;
  signals: { code: string; strength: number; evidence: string; source: string }[];
  fitScore: number;
  product: 'GEO' | 'AR' | 'BOTH';
  providersHit: { platform: string; owner: string | null; ok: boolean }[];
}

export class EnrichmentEngine {
  private pool: AccountPool;
  constructor(private db: Database.Database) {
    this.pool = new AccountPool(db);
  }

  /** Route one provider call through the pool and log attribution. */
  private async callProvider(
    platformId: string,
    input: { company: string; domain?: string; contactName?: string },
    leadId: number | null,
  ): Promise<EnrichOutput | null> {
    const lease = this.pool.lease(platformId);
    const connector = getConnector(platformId);
    const out = await connector.enrich(input, lease?.account ?? null);

    if (lease) {
      lease.release(!out.rateLimited, { rateLimited: out.rateLimited });
      this.db
        .prepare(
          `INSERT INTO enrichment_runs (lead_id, platform_id, account_id, owner_name, ok, detail, credits_used)
           VALUES (?,?,?,?,?,?,1)`,
        )
        .run(
          leadId,
          platformId,
          lease.account.id,
          lease.account.owner_name,
          out.rateLimited ? 0 : 1,
          out.rateLimited ? 'rate-limited → failover' : `${out.evidence.length} evidence`,
        );
    }
    if (out.rateLimited) return null;
    return out;
  }

  async enrichLead(lead: { id: number; company: string; domain?: string; contact_name?: string }): Promise<EnrichResult> {
    const input = { company: lead.company, domain: lead.domain, contactName: lead.contact_name };
    const providersHit: EnrichResult['providersHit'] = [];
    const fields: EnrichResult['fields'] = {};

    // ── 1. Contact/email waterfall — cheapest first, stop at verified ──────
    for (const p of WATERFALL_ORDER) {
      const out = await this.callProvider(p.id, input, lead.id);
      providersHit.push({ platform: p.id, owner: null, ok: !!out });
      if (!out) continue;
      fields.email ??= out.email;
      fields.email_status ??= out.emailStatus;
      fields.phone ??= out.phone;
      fields.linkedin ??= out.linkedin;
      fields.industry ??= out.industry;
      fields.employee_count ??= out.employeeCount;
      fields.location ??= out.location;
      if (fields.email && fields.email_status === 'verified') break; // waterfall short-circuit
    }

    // ── 2. Signal evidence sweep across every signal-source platform ───────
    const evidence: { text: string; source: string }[] = [];
    for (const pid of SIGNAL_SOURCE_PLATFORMS) {
      const out = await this.callProvider(pid, input, lead.id);
      if (!out) continue;
      for (const e of out.evidence) evidence.push({ text: e, source: pid });
      fields.industry ??= out.industry;
      fields.employee_count ??= out.employeeCount;
      fields.location ??= out.location;
    }

    // ── 3. Detect signals from evidence ────────────────────────────────────
    const detected = this.detectSignals(evidence);

    // ── 4. Score + route ───────────────────────────────────────────────────
    const { fitScore, product } = this.score(detected, fields);

    return {
      fields,
      signals: detected.map((d) => ({
        code: d.def.code,
        strength: d.strength,
        evidence: d.evidence,
        source: d.source,
      })),
      fitScore,
      product,
      providersHit,
    };
  }

  private detectSignals(evidence: { text: string; source: string }[]) {
    const hits: { def: SignalDef; strength: number; evidence: string; source: string }[] = [];
    for (const ev of evidence) {
      const lower = ev.text.toLowerCase();
      for (const sig of SIGNALS) {
        if (!sig.match) continue;
        if (sig.match.some((m) => lower.includes(m.toLowerCase()))) {
          if (hits.find((h) => h.def.code === sig.code)) continue; // dedupe
          hits.push({ def: sig, strength: sig.weight, evidence: ev.text, source: ev.source });
        }
      }
    }
    return hits;
  }

  private score(
    detected: { def: SignalDef; strength: number }[],
    fields: EnrichResult['fields'],
  ): { fitScore: number; product: 'GEO' | 'AR' | 'BOTH' } {
    // Data-quality base (verified contact data is the foundation per playbook).
    // Kept modest so the *signal* strength — not just having an email — drives
    // qualification, giving a realistic score spread across the pipeline.
    let score = 0;
    if (fields.email) score += fields.email_status === 'verified' ? 12 : 5;
    if (fields.phone) score += 4;
    if (fields.linkedin) score += 3;
    // ICP fit: sweet-spot company size 10-200.
    const size = fields.employee_count ?? 0;
    if (size >= 10 && size <= 200) score += 6;

    // Signal contribution, capped at 55 so one over-signalled lead can't run
    // away and the score keeps a realistic spread across the pipeline.
    let geo = 0, ar = 0, signalScore = 0;
    for (const d of detected) {
      signalScore += d.strength;
      if (d.def.product === 'GEO') geo += d.strength;
      else if (d.def.product === 'AR') ar += d.strength;
      else { geo += d.strength / 2; ar += d.strength / 2; }
    }
    score += Math.min(50, signalScore);
    const product = geo === ar ? 'BOTH' : geo > ar ? 'GEO' : 'AR';
    return { fitScore: Math.min(100, Math.round(score)), product };
  }

  /** Persist an enrichment result back onto the lead + its signals. */
  persist(leadId: number, result: EnrichResult) {
    const f = result.fields;
    this.db
      .prepare(
        `UPDATE leads SET email=COALESCE(?,email), email_status=COALESCE(?,email_status),
             phone=COALESCE(?,phone), linkedin=COALESCE(?,linkedin),
             industry=COALESCE(?,industry), employee_count=COALESCE(?,employee_count),
             location=COALESCE(?,location), fit_score=?, product=?,
             status=CASE WHEN ? >= 60 THEN 'qualified' ELSE 'enriched' END,
             enrichment=?, updated_at=datetime('now')
         WHERE id=?`,
      )
      .run(
        f.email ?? null, f.email_status ?? null, f.phone ?? null, f.linkedin ?? null,
        f.industry ?? null, f.employee_count ?? null, f.location ?? null,
        result.fitScore, result.product, result.fitScore,
        JSON.stringify({ providersHit: result.providersHit }), leadId,
      );

    this.db.prepare(`DELETE FROM lead_signals WHERE lead_id=?`).run(leadId);
    const ins = this.db.prepare(
      `INSERT INTO lead_signals (lead_id, signal_code, strength, evidence, source) VALUES (?,?,?,?,?)`,
    );
    for (const s of result.signals) ins.run(leadId, s.code, s.strength, s.evidence, s.source);
  }
}
