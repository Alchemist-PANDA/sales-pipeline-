/**
 * Room 2 — Selection + Enrichment pipeline.
 *
 * Turns a human-selected signal into an actionable lead. For each signal marked
 * `selected_for_enrichment` it:
 *   1. resolves/creates the company (companies table, deduped by domain)
 *   2. runs the contact/people waterfall through the account pool, each provider
 *      call gated by a per-provider BudgetGuard (calls/failures/cooldown/circuit
 *      breaker) and logged to provider_usage
 *   3. creates decision-maker people rows
 *   4. verifies the signal claim (verifyClaim: tiered, multi-source, provenance)
 *   5. scores the opportunity (icp / intent / freshness / evidence / contact) and
 *      writes a lead_opportunities row carrying the unified actionable-lead JSON
 *   6. flips the signal to `enriched` and links its canonical company
 *
 * Nothing here runs without explicit selection — enrichment is never automatic.
 */

import type Database from 'better-sqlite3';
import { AccountPool } from '../core/pool.js';
import { getConnector } from '../connectors/index.js';
import { WATERFALL_ORDER } from '../core/registry.js';
import { BudgetGuard, ProviderBudget } from '../core/budget.js';
import { verifyClaim, EvidenceItem, EvidenceTier } from '../core/verification.js';

/** Default per-provider budgets for the enrichment waterfall. Conservative —
 *  protects paid/limited-credit providers from runaway spend on a single run. */
function defaultBudgets(): ProviderBudget[] {
  return WATERFALL_ORDER.map((p) => ({
    providerId: p.id,
    maxCallsPerRun: 40,
    maxCallsPerHour: 300,
    maxCallsPerDay: 1000,
    maxFailuresPerRun: 8,
    maxConsecutiveFailures: 4,
    cooldownMinutes: 10,
    estimatedCostPerCallUsd: (p.costWeight ?? 1) * 0.01,
    maxCostPerRunUsd: 5,
  }));
}

function domainFrom(name: string, fallbackDomain?: string | null): string {
  if (fallbackDomain && /\./.test(fallbackDomain)) return fallbackDomain.replace(/^www\./, '').toLowerCase();
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
}

function nameFromEmail(email?: string): string | null {
  if (!email) return null;
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  if (!parts.length) return null;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** Assign an evidence tier from the source platform/domain relative to the company. */
function tierFor(sourcePlatform: string, sourceDomain: string | null, companyDomain: string): EvidenceTier {
  const p = (sourcePlatform || '').toLowerCase();
  if (['sec_edgar', 'uspto', 'gov'].some((x) => p.includes(x))) return 'authoritative';
  if (sourceDomain && sourceDomain.toLowerCase() === companyDomain.toLowerCase()) return 'primary';
  if (['linkedin', 'crunchbase', 'g2', 'clutch', 'glassdoor'].some((x) => p.includes(x))) return 'reputable';
  return 'unknown';
}

export interface EnrichmentSummary {
  processed: number;
  enriched: number;
  companies: number;
  people: number;
  opportunities: number;
  skipped: { id: number; reason: string }[];
  budgetSnapshot: Record<string, unknown>;
}

export class RoomEnrichmentService {
  private pool: AccountPool;
  private budget: BudgetGuard;

  constructor(private db: Database.Database) {
    this.pool = new AccountPool(db);
    this.budget = new BudgetGuard(defaultBudgets());
  }

  /** Enrich every signal currently selected_for_enrichment. */
  async enrichSelected(actor = 'admin', limit = 50): Promise<EnrichmentSummary> {
    const signals = this.db.prepare(
      `SELECT * FROM signal_events WHERE status='selected_for_enrichment' ORDER BY relevance DESC, id ASC LIMIT ?`,
    ).all(limit) as any[];

    const summary: EnrichmentSummary = {
      processed: 0, enriched: 0, companies: 0, people: 0, opportunities: 0, skipped: [], budgetSnapshot: {},
    };
    this.budget.resetRun();

    for (const signal of signals) {
      summary.processed++;
      try {
        const result = await this.enrichOne(signal, actor);
        summary.enriched++;
        summary.companies += result.companyCreated ? 1 : 0;
        summary.people += result.peopleCreated;
        summary.opportunities += result.opportunityCreated ? 1 : 0;
      } catch (err: any) {
        summary.skipped.push({ id: signal.id, reason: err?.message ?? 'enrichment failed' });
      }
    }
    summary.budgetSnapshot = this.budget.snapshot();
    return summary;
  }

  private async enrichOne(signal: any, actor: string) {
    const companyName = (signal.company_name_raw || signal.title || 'Unknown Company').trim();
    // Derive the company domain from the company itself — never from the signal's
    // SOURCE domain (e.g. linkedin.com), which would collapse distinct companies.
    const companyDomain = domainFrom(companyName, signal.company_domain);

    // ── 1. Company resolution (dedupe by domain) ────────────────────────────
    const existingCompany = this.db.prepare(`SELECT * FROM companies WHERE domain=?`).get(companyDomain) as any;
    let companyId: number;
    let companyCreated = false;
    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const info = this.db.prepare(
        `INSERT INTO companies (legal_name, trading_name, domain, verification_status, confidence, provenance_json)
         VALUES (?,?,?,?,?,?)`,
      ).run(companyName, companyName, companyDomain, 'unverified', 0.4,
        JSON.stringify({ from: 'signal', signalId: signal.id, sourceUrl: signal.source_url }));
      companyId = Number(info.lastInsertRowid);
      companyCreated = true;
    }

    // ── 2. Contact/people waterfall (budgeted + pooled) ─────────────────────
    const input = { company: companyName, domain: companyDomain };
    const fields: Record<string, any> = {};
    const enrichmentEvidence: EvidenceItem[] = [];

    for (const p of WATERFALL_ORDER) {
      const decision = this.budget.canCall(p.id);
      if (!decision.allowed) continue;

      const lease = this.pool.lease(p.id);
      const connector = getConnector(p.id);
      const started = Date.now();
      let ok = false;
      let rateLimited = false;
      try {
        const out = await connector.enrich(input, lease?.account ?? null);
        rateLimited = !!out.rateLimited;
        ok = !rateLimited;
        if (ok) {
          fields.email ??= out.email;
          fields.email_status ??= out.emailStatus;
          fields.phone ??= out.phone;
          fields.linkedin ??= out.linkedin;
          fields.industry ??= out.industry;
          fields.employee_count ??= out.employeeCount;
          fields.location ??= out.location;
          for (const e of out.evidence ?? []) {
            enrichmentEvidence.push({
              sourceId: p.id, text: e, retrievedAt: new Date().toISOString(),
              tier: tierFor(p.id, null, companyDomain), companyDomain,
            });
          }
        }
      } catch {
        ok = false;
      } finally {
        if (lease) lease.release(ok, { rateLimited });
      }

      this.budget.record(p.id, { ok, rateLimited });
      this.db.prepare(
        `INSERT INTO provider_usage (provider_id, operation, ok, calls, latency_ms, error_class)
         VALUES (?,?,?,?,?,?)`,
      ).run(p.id, 'contact_waterfall', ok ? 1 : 0, 1, Date.now() - started, rateLimited ? 'rate_limited' : ok ? null : 'error');

      if (fields.email && fields.email_status === 'verified') break; // waterfall short-circuit
    }

    // ── 3. Decision-maker person ────────────────────────────────────────────
    let peopleCreated = 0;
    const personName = nameFromEmail(fields.email);
    if (personName && (fields.email || fields.linkedin)) {
      const info = this.db.prepare(
        `INSERT OR IGNORE INTO people (company_id, full_name, title, email, email_status, phone, linkedin_url,
             role_in_buying_committee, relevance, verification_status, confidence, provenance_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        companyId, personName, 'Decision Maker', fields.email ?? null, fields.email_status ?? null,
        fields.phone ?? null, fields.linkedin ?? null, 'decision_maker',
        signal.relevance ?? 0, fields.email_status === 'verified' ? 'verified' : 'unverified',
        fields.email_status === 'verified' ? 0.85 : 0.5,
        JSON.stringify({ from: 'waterfall' }),
      );
      peopleCreated = info.changes ? 1 : 0;
    }

    // ── 4. Verification of the signal claim ─────────────────────────────────
    const signalEvidence: EvidenceItem[] = [{
      sourceId: signal.source_id || signal.source_platform || 'signal',
      sourceUrl: signal.source_url,
      sourceDomain: signal.source_domain,
      title: signal.title,
      text: signal.raw_text || signal.title || '',
      publishedAt: signal.published_at,
      retrievedAt: signal.first_seen_at || new Date().toISOString(),
      tier: tierFor(signal.source_id || signal.source_platform || '', signal.source_domain, companyDomain),
      companyDomain,
    }];
    const verification = verifyClaim({
      evidence: [...signalEvidence, ...enrichmentEvidence],
      minimumConfidence: 0.5,
      requirePrimaryOrTwoIndependent: false,
      expectedCompanyDomain: companyDomain,
    });

    // Persist enrichment facts + verification back onto the company.
    this.db.prepare(
      `UPDATE companies SET industry=COALESCE(?,industry), employee_count=COALESCE(?,employee_count),
           country=COALESCE(?,country), verification_status=?, confidence=?, updated_at=datetime('now') WHERE id=?`,
    ).run(
      fields.industry ?? null, fields.employee_count ?? null, fields.location ?? null,
      verification.verified ? 'verified' : 'unverified', verification.confidence, companyId,
    );

    // ── 5. Scoring → lead_opportunities ─────────────────────────────────────
    const scores = this.score(signal, fields, verification.confidence);
    const actionableLead = {
      company: { id: companyId, name: companyName, domain: companyDomain, industry: fields.industry, employeeCount: fields.employee_count, location: fields.location },
      decisionMaker: personName ? { name: personName, email: fields.email, emailStatus: fields.email_status, phone: fields.phone, linkedin: fields.linkedin } : null,
      signal: { code: signal.signal_code, title: signal.title, sourceUrl: signal.source_url, sourcePlatform: signal.source_id, evidence: signal.raw_text },
      verification: { verified: verification.verified, confidence: verification.confidence, reasons: verification.reasons, conflicts: verification.conflicts, sources: verification.supportingEvidence.length },
      scores,
      recommendation: this.recommend(signal, scores),
    };

    const opp = this.db.prepare(
      `INSERT INTO lead_opportunities (strategy_id, signal_event_id, company_id, status, priority_score,
           icp_score, intent_score, freshness_score, evidence_confidence, contactability_score,
           recommended_offer, recommended_angle, recommended_next_action, actionable_lead_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(strategy_id, signal_event_id, company_id) DO UPDATE SET
         status=excluded.status, priority_score=excluded.priority_score, icp_score=excluded.icp_score,
         intent_score=excluded.intent_score, freshness_score=excluded.freshness_score,
         evidence_confidence=excluded.evidence_confidence, contactability_score=excluded.contactability_score,
         recommended_offer=excluded.recommended_offer, recommended_angle=excluded.recommended_angle,
         recommended_next_action=excluded.recommended_next_action, actionable_lead_json=excluded.actionable_lead_json,
         updated_at=datetime('now')`,
    ).run(
      signal.strategy_id, signal.id, companyId,
      scores.priority >= 60 ? 'qualified' : 'researching',
      scores.priority, scores.icp, scores.intent, scores.freshness, scores.evidence, scores.contactability,
      actionableLead.recommendation.offer, actionableLead.recommendation.angle, actionableLead.recommendation.nextAction,
      JSON.stringify(actionableLead),
    );

    // ── 6. Flip signal → enriched, link company ─────────────────────────────
    this.db.prepare(
      `UPDATE signal_events SET status='enriched', canonical_company_id=?, verification_status=?, last_seen_at=datetime('now') WHERE id=?`,
    ).run(companyId, verification.verified ? 'verified' : 'unverified', signal.id);

    return { companyCreated, peopleCreated, opportunityCreated: opp.changes > 0 };
  }

  /** Composite scoring in 0-100 (priority) with 0-1 component scores. */
  private score(signal: any, fields: Record<string, any>, evidenceConfidence: number) {
    // ICP: employee-band fit (sweet spot 10-200) + industry known.
    const size = Number(fields.employee_count ?? 0);
    let icp = 0.4;
    if (size >= 10 && size <= 200) icp = 1;
    else if (size > 0 && size <= 500) icp = 0.7;
    if (fields.industry) icp = Math.min(1, icp + 0.1);

    // Intent: from the signal's own relevance (0-100 → 0-1).
    const intent = Math.max(0, Math.min(1, Number(signal.relevance ?? 0) / 100));

    // Freshness: age of the signal.
    const ts = signal.published_at || signal.first_seen_at;
    let freshness = 0.6;
    if (ts) {
      const ageDays = Math.max(0, (Date.now() - new Date(ts).getTime()) / 86_400_000);
      freshness = ageDays <= 7 ? 1 : ageDays <= 30 ? 0.85 : ageDays <= 90 ? 0.6 : ageDays <= 365 ? 0.35 : 0.15;
    }

    // Contactability: verified email + phone + linkedin.
    let contactability = 0;
    if (fields.email) contactability += fields.email_status === 'verified' ? 0.6 : 0.3;
    if (fields.phone) contactability += 0.25;
    if (fields.linkedin) contactability += 0.15;
    contactability = Math.min(1, contactability);

    const priority = Math.round(
      100 * (icp * 0.25 + intent * 0.3 + freshness * 0.15 + evidenceConfidence * 0.15 + contactability * 0.15),
    );
    return {
      priority, icp: round2(icp), intent: round2(intent), freshness: round2(freshness),
      evidence: round2(evidenceConfidence), contactability: round2(contactability),
    };
  }

  private recommend(signal: any, scores: { priority: number }) {
    const hypotheses = safeArray(signal.signal_hypotheses_json);
    const painHint = hypotheses[0]?.replace(/^possible:/, '') || signal.signal_code || 'operational overload';
    return {
      offer: 'Agentic automation / SaaS to relieve ' + painHint,
      angle: `Reference the observed signal ("${(signal.title || '').slice(0, 80)}") as the reason for outreach.`,
      nextAction: scores.priority >= 60
        ? 'Qualified — route to an owner for personalized outreach now.'
        : 'Research further or gather a second corroborating source before outreach.',
    };
  }
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function safeArray(json: unknown): string[] {
  try { const v = JSON.parse(String(json ?? '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
}
