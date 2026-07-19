/**
 * REST API. Thin controllers over the core services — all business logic lives
 * in core/ and services/. Every route is JSON in / JSON out.
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { PLATFORMS, platformsByCategory, PLATFORMS_BY_ID, SIGNAL_PRIORITY_ORDER } from '../core/registry.js';
import { SIGNALS } from '../core/signals.js';
import { AccountPool } from '../core/pool.js';
import { EnrichmentEngine } from '../services/enrich.js';
import { CredentialService } from '../services/credentials.js';
import { CredentialValidator } from '../services/credentialValidator.js';
import { hasScraperSupport } from '../scrapers/platforms/index.js';
import { supportsSessionCapture } from '../scrapers/sessionCapture.js';

export const api = Router();
const pool = new AccountPool(db);
const engine = new EnrichmentEngine(db);
const creds = new CredentialService(db);
const validator = new CredentialValidator(db);

const one = <T>(sql: string, ...p: any[]) => db.prepare(sql).get(...p) as T;
const all = <T>(sql: string, ...p: any[]) => db.prepare(sql).all(...p) as T[];

// ── Registry & catalog ─────────────────────────────────────────────────────
api.get('/registry', (_req, res) => {
  res.json({
    platforms: PLATFORMS.map((p) => ({
      ...p,
      capacity: pool.capacity(p.id),
      scraper: hasScraperSupport(p.id),
      sessionCapture: supportsSessionCapture(p.id),
    })),
    byCategory: Object.fromEntries(
      Object.entries(platformsByCategory()).map(([k, v]) => [k, v.map((p) => p.id)]),
    ),
    signalPriorityOrder: SIGNAL_PRIORITY_ORDER.map((p) => p.id),
  });
});
api.get('/signals', (_req, res) => res.json({ signals: SIGNALS }));

// ── Dashboard summary ──────────────────────────────────────────────────────
api.get('/dashboard', (_req, res) => {
  const leadStats = one<any>(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN fit_score>=60 THEN 1 ELSE 0 END) qualified,
            SUM(CASE WHEN status='enriched' OR status='qualified' THEN 1 ELSE 0 END) enriched,
            ROUND(AVG(CASE WHEN fit_score>0 THEN fit_score END),1) avg_score
       FROM leads`,
  );
  const owners = one<any>(
    `SELECT COUNT(*) total, SUM(status='active') active, SUM(status='reserved') reserved FROM owners`,
  );
  const accounts = one<any>(
    `SELECT COUNT(*) total, SUM(status='connected') connected FROM accounts`,
  );
  const runs = one<any>(`SELECT COUNT(*) total, SUM(ok) ok FROM enrichment_runs`);
  const productSplit = all<any>(`SELECT product, COUNT(*) n FROM leads WHERE fit_score>0 GROUP BY product`);
  const topSignals = all<any>(
    `SELECT signal_code, COUNT(*) n FROM lead_signals GROUP BY signal_code ORDER BY n DESC LIMIT 8`,
  );
  const scoreBuckets = all<any>(
    `SELECT CASE WHEN fit_score>=80 THEN '80-100' WHEN fit_score>=60 THEN '60-79'
                 WHEN fit_score>=40 THEN '40-59' WHEN fit_score>0 THEN '1-39' ELSE '0' END bucket,
            COUNT(*) n FROM leads GROUP BY bucket`,
  );
  const contribution = all<any>(
    `SELECT owner_name, COUNT(*) calls, SUM(ok) ok FROM enrichment_runs
      WHERE owner_name IS NOT NULL GROUP BY owner_name ORDER BY calls DESC LIMIT 10`,
  );
  res.json({ leadStats, owners, accounts, runs, productSplit, topSignals, scoreBuckets, contribution, poolOverview: pool.overview() });
});

// ── Owners / team ──────────────────────────────────────────────────────────
api.get('/owners', (_req, res) => {
  const owners = all<any>(
    `SELECT o.*,
       (SELECT COUNT(*) FROM accounts a WHERE a.owner_id=o.id AND a.status='connected') connected_accounts,
       (SELECT COUNT(*) FROM accounts a WHERE a.owner_id=o.id) total_accounts
       FROM owners o ORDER BY o.status='active' DESC, o.id`,
  );
  res.json({ owners });
});

api.post('/owners/:id/activate', (req, res) => {
  db.prepare(`UPDATE owners SET status='active' WHERE id=?`).run(req.params.id);
  db.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES ('admin','activate_owner',?)`).run(`owner ${req.params.id}`);
  res.json({ ok: true });
});
api.post('/owners/:id/reserve', (req, res) => {
  db.prepare(`UPDATE owners SET status='reserved' WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ── Accounts / integrations ────────────────────────────────────────────────
api.get('/accounts', (req, res) => {
  const platform = req.query.platform as string | undefined;
  const rows = all<any>(
    `SELECT a.id, a.platform_id, a.status, a.quota_limit, a.quota_used, a.health,
            a.last_used_at, a.cooldown_until, o.name owner_name, o.status owner_status
       FROM accounts a JOIN owners o ON o.id=a.owner_id
      ${platform ? 'WHERE a.platform_id=?' : ''}
      ORDER BY a.platform_id, o.status='active' DESC`,
    ...(platform ? [platform] : []),
  );
  res.json({ accounts: rows });
});

// ── FAST CREDENTIAL ENTRY (connect in seconds) ─────────────────────────────
api.post('/credentials/connect', (req, res) => {
  const { ownerId, platformId, secret, label } = req.body;
  res.json(creds.connectOne({ ownerId, platformId, secret, label }));
});
api.post('/credentials/bulk', (req, res) => {
  const { platformId, raw, field } = req.body;
  res.json(creds.bulkConnect({ platformId, raw, field }));
});
api.post('/credentials/invites', (req, res) => {
  res.json({ links: creds.mintInvites(req.body?.ownerIds) });
});
api.get('/credentials/invite/:token', (req, res) => {
  const r = creds.resolveInvite(req.params.token);
  if (!r) return res.status(404).json({ error: 'invalid token' });
  res.json(r);
});
api.post('/credentials/gateway', (req, res) => {
  const { ownerId, gatewayPlatformId, token } = req.body;
  res.json(creds.gatewayAutoconnect({ ownerId, gatewayPlatformId, token }));
});

// Table 1 — one box for every API key; system distributes + rotates.
api.post('/credentials/master', (req, res) => {
  const { raw } = req.body;
  if (typeof raw !== 'string' || !raw.trim()) return res.status(400).json({ error: 'raw required' });
  res.json(creds.masterConnect(raw));
});

// Table 2 — one click enables all scraping (public instant, login via capture).
api.post('/credentials/scraping/one-click', (_req, res) => {
  res.json(creds.oneClickScraping());
});

// Table 2 — automated login → cookie harvest (no manual cookie hunting).
api.post('/credentials/scraping/capture', async (req, res) => {
  const { ownerId, platformId, email, password } = req.body;
  if (!ownerId || !platformId || !email || !password)
    return res.status(400).json({ error: 'ownerId, platformId, email, password required' });
  res.json(await creds.captureSessionFor({ ownerId, platformId, email, password }));
});

// Cheap credential validation — free account/quota check, cached, no credits spent.
api.post('/credentials/validate', async (req, res) => {
  try {
    if (req.body?.platformId) {
      res.json({ results: [await validator.validatePlatform(String(req.body.platformId))] });
    } else {
      res.json(await validator.validateAll());
    }
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'validation failed' });
  }
});

// ── Leads ──────────────────────────────────────────────────────────────────
api.get('/leads', (req, res) => {
  const min = Number(req.query.minScore ?? 0);
  const leads = all<any>(
    `SELECT * FROM leads WHERE fit_score>=? ORDER BY fit_score DESC, updated_at DESC LIMIT 200`,
    min,
  );
  const sigs = all<any>(`SELECT lead_id, signal_code, strength, evidence, source FROM lead_signals`);
  const byLead = new Map<number, any[]>();
  for (const s of sigs) (byLead.get(s.lead_id) ?? byLead.set(s.lead_id, []).get(s.lead_id))!.push(s);
  res.json({ leads: leads.map((l) => ({ ...l, signals: byLead.get(l.id) ?? [] })) });
});

api.post('/leads', (req, res) => {
  const { company, domain, contact_name, title } = req.body;
  const info = db
    .prepare(`INSERT INTO leads (company, domain, contact_name, title, source) VALUES (?,?,?,?, 'manual')`)
    .run(company, domain ?? null, contact_name ?? null, title ?? null);
  res.json({ id: info.lastInsertRowid });
});

// ── Enrichment (the autonomous pipeline) ───────────────────────────────────
api.post('/enrich/:id', async (req, res) => {
  const lead = one<any>(`SELECT * FROM leads WHERE id=?`, req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  const result = await engine.enrichLead(lead);
  engine.persist(lead.id, result);
  res.json({ leadId: lead.id, ...result });
});

api.post('/enrich-batch', async (req, res) => {
  const limit = Number(req.body?.limit ?? 30);
  const leads = all<any>(`SELECT * FROM leads WHERE status='new' ORDER BY id LIMIT ?`, limit);
  let qualified = 0;
  for (const lead of leads) {
    const r = await engine.enrichLead(lead);
    engine.persist(lead.id, r);
    if (r.fitScore >= 60) qualified++;
  }
  res.json({ processed: leads.length, qualified });
});

api.get('/runs', (_req, res) => {
  res.json({ runs: all<any>(`SELECT * FROM enrichment_runs ORDER BY id DESC LIMIT 100`) });
});
