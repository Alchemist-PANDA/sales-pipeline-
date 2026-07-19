import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/index.js';
import { freeSourcesForRoom, validatePartnerAccountCount } from '../core/freeRoomSources.js';
import {
  ROOM_LABELS,
  RoomMode,
  assertJobBoardSignalOnly,
  assertSupportedSignalLinks,
  rejectEnterpriseTarget,
} from '../core/rooms.js';
import { RoomControlService } from '../services/roomControl.js';
import { SignalCollectorService } from '../services/sourceCollectors.js';
import { RoomEnrichmentService } from '../services/roomEnrichment.js';

export const roomsApi = Router();
const rooms = new RoomControlService(db);
const collectors = new SignalCollectorService(db);
const enrichment = new RoomEnrichmentService(db);
const roomIds = new Set<RoomMode>(Object.keys(ROOM_LABELS) as RoomMode[]);

function safeJson<T>(raw: unknown, fallback: T): T {
  try { return JSON.parse(String(raw ?? '')) as T; } catch { return fallback; }
}

function roomOrThrow(value: unknown): RoomMode {
  if (typeof value !== 'string' || !roomIds.has(value as RoomMode)) throw new Error('Invalid room.');
  return value as RoomMode;
}

function sourceDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function handle(res: any, fn: () => unknown | Promise<unknown>) {
  Promise.resolve().then(fn).then((result) => res.json(result)).catch((error: any) => res.status(400).json({ error: error?.message ?? 'request failed' }));
}

roomsApi.get('/state', (_req, res) => res.json({ ...rooms.getState(), labels: ROOM_LABELS }));

roomsApi.post('/activate', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  return { ok: true, state: rooms.activate(room, req.body?.actor || 'admin') };
}));

roomsApi.post('/idle', (req, res) => handle(res, () => ({ ok: true, state: rooms.setIdle(req.body?.actor || 'admin') })));

roomsApi.get('/sources', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.query.room);
  if (room !== 'referrals_room' && room !== 'community_monitoring_room') return { room, sources: [] };
  return { room, sources: freeSourcesForRoom(room) };
}));

roomsApi.post('/sources/configure', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  rooms.assertActive(room);
  const source = validatePartnerAccountCount(String(req.body?.sourceId || ''), Number(req.body?.accountCount || 1));
  if (source.room !== room) throw new Error(`${source.name} is not configured for ${room}.`);
  const ownerIds = Array.isArray(req.body?.ownerIds) ? req.body.ownerIds.map(Number).filter(Number.isFinite) : [];
  if (source.accessModel === 'partner_owned_pool' || source.accessModel === 'authorized_workspace_app') {
    if (!req.body?.consentConfirmed) throw new Error('Partner-owned/API connections require explicit consent confirmation.');
    if (ownerIds.length !== Number(req.body.accountCount)) throw new Error('Provide one ownerId for each authorized partner connection.');
  }
  if (source.maxPartnerAccounts === 1 && Number(req.body.accountCount) !== 1) throw new Error(`${source.name} uses one shared integration.`);

  const insert = db.prepare(`INSERT INTO room_source_connections
    (room,source_id,owner_id,access_model,status,consent_confirmed,quota_limit,updated_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(room,source_id,owner_id) DO UPDATE SET
      access_model=excluded.access_model,status=excluded.status,
      consent_confirmed=excluded.consent_confirmed,quota_limit=excluded.quota_limit,
      updated_at=datetime('now')`);

  const targets = ownerIds.length ? ownerIds : [null];
  const tx = db.transaction(() => {
    for (const ownerId of targets) insert.run(room, source.id, ownerId, source.accessModel, 'configured', req.body?.consentConfirmed ? 1 : 0, req.body?.quotaLimit ?? null);
  });
  tx();
  return { ok: true, source, configured: targets.length };
}));

roomsApi.get('/signals', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.query.room);
  rooms.assertActive(room);
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const rows = db.prepare(`SELECT * FROM signal_events WHERE room_origin=? ${status ? 'AND status=?' : ''} ORDER BY first_seen_at DESC LIMIT 500`)
    .all(...(status ? [room, status] : [room])) as any[];
  return {
    room,
    signals: rows.map((row) => ({
      ...row,
      source_links: JSON.parse(row.source_links_json || '[]'),
      signal_hypotheses: JSON.parse(row.signal_hypotheses_json || '[]'),
      evidence: row.evidence_json ? JSON.parse(row.evidence_json) : null,
    })),
  };
}));

roomsApi.post('/signals/manual', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  if (!['signal_room', 'referrals_room', 'community_monitoring_room', 'manual_signal_room'].includes(room)) {
    throw new Error('This room cannot create signal records.');
  }
  rooms.assertActive(room);
  const links = req.body?.sourceLinks;
  assertSupportedSignalLinks(links);
  const sourcePlatform = String(req.body?.sourcePlatform || 'manual');
  const title = String(req.body?.title || '').trim();
  const rawText = String(req.body?.rawText || req.body?.description || '').trim();
  const company = String(req.body?.companyNameRaw || '').trim();
  const strategyId = String(req.body?.strategyId || '').trim();
  if (!title || !rawText || !company || !strategyId) throw new Error('strategyId, title, rawText and companyNameRaw are required.');
  assertJobBoardSignalOnly({ sourcePlatform, title, snippet: rawText });
  rejectEnterpriseTarget({ companyName: company, employeeCount: req.body?.employeeCount, maxEmployees: req.body?.maxEmployees ?? 500 });

  const primaryUrl = links[0].url;
  const eventHash = crypto.createHash('sha256').update(`${room}|${sourcePlatform}|${primaryUrl}|${title}|${company}`.toLowerCase()).digest('hex');
  const hypotheses = Array.isArray(req.body?.signalHypotheses) ? req.body.signalHypotheses : [];
  const info = db.prepare(`INSERT INTO signal_events
    (strategy_id,signal_code,title,raw_text,source_id,source_url,source_domain,company_name_raw,
     relevance,confidence,verification_status,evidence_json,event_hash,status,room_origin,
     source_links_json,signal_hypotheses_json,rationale,sme_fit)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(strategyId, req.body?.signalType ?? null, title, rawText, sourcePlatform, primaryUrl,
      sourceDomain(primaryUrl), company, Number(req.body?.relevance ?? 0), Number(req.body?.confidence ?? 0),
      'unverified', JSON.stringify(req.body?.evidence ?? { rawText }), eventHash, 'candidate', room,
      JSON.stringify(links), JSON.stringify(hypotheses), req.body?.rationale ?? null, req.body?.smeFit ?? 'unknown');
  return { ok: true, id: info.lastInsertRowid, room, status: 'candidate' };
}));

/**
 * Manual/import collector for X, Facebook groups, LinkedIn, Upwork, Google Alerts,
 * F5Bot and n8n. Each item must carry a source URL so the signal remains auditable.
 */
roomsApi.post('/imports/:sourceId', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  rooms.assertActive(room);
  if (room !== 'referrals_room' && room !== 'community_monitoring_room') throw new Error('Imports are only supported in Room 3 or Room 4.');
  const source = validatePartnerAccountCount(req.params.sourceId, 1);
  if (source.room !== room) throw new Error(`${source.name} is not configured for ${room}.`);
  const strategyId = String(req.body?.strategyId || '').trim();
  if (!strategyId) throw new Error('strategyId is required.');
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw new Error('items are required.');
  const strategy = collectors.loadStrategy(strategyId);
  return { ok: true, room, sourceId: source.id, ...collectors.ingestImported(room, source.id, strategy, items) };
}));

/** Webhook alias for n8n, F5Bot-forwarded alerts and operator-controlled automations. */
roomsApi.post('/webhooks/:sourceId', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  rooms.assertActive(room);
  const source = validatePartnerAccountCount(req.params.sourceId, 1);
  if (source.room !== room) throw new Error(`${source.name} is not configured for ${room}.`);
  const strategyId = String(req.body?.strategyId || '').trim();
  if (!strategyId) throw new Error('strategyId is required.');
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body?.item ?? req.body];
  const strategy = collectors.loadStrategy(strategyId);
  return { ok: true, room, sourceId: source.id, ...collectors.ingestImported(room, source.id, strategy, items) };
}));

roomsApi.post('/signals/select', (req, res) => handle(res, () => {
  rooms.assertActive('selection_enrichment_room');
  const ids = Array.isArray(req.body?.signalIds) ? req.body.signalIds.map(Number).filter(Number.isFinite) : [];
  if (!ids.length) throw new Error('signalIds are required.');
  const marks = ids.map(() => '?').join(',');
  const info = db.prepare(`UPDATE signal_events SET status='selected_for_enrichment',selected_at=datetime('now'),selected_by=? WHERE id IN (${marks}) AND status IN ('candidate','reviewed')`)
    .run(req.body?.actor || 'admin', ...ids);
  return { ok: true, selected: info.changes };
}));

/**
 * Selection-room inbox — signals awaiting review/selection across every origin
 * room. Room 2 works this queue; status filter defaults to the actionable set.
 */
roomsApi.get('/signals/inbox', (req, res) => handle(res, () => {
  rooms.assertActive('selection_enrichment_room');
  const statuses = typeof req.query.status === 'string' && req.query.status
    ? [String(req.query.status)]
    : ['candidate', 'reviewed', 'selected_for_enrichment'];
  const marks = statuses.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM signal_events WHERE status IN (${marks}) ORDER BY relevance DESC, first_seen_at DESC LIMIT 500`,
  ).all(...statuses) as any[];
  return {
    counts: db.prepare(`SELECT status, COUNT(*) n FROM signal_events GROUP BY status`).all(),
    signals: rows.map((row) => ({
      ...row,
      source_links: safeJson(row.source_links_json, []),
      signal_hypotheses: safeJson(row.signal_hypotheses_json, []),
    })),
  };
}));

/** Run enrichment on all selected signals → companies, people, opportunities. */
roomsApi.post('/signals/enrich', (req, res) => handle(res, async () => {
  rooms.assertActive('selection_enrichment_room');
  return { ok: true, ...(await enrichment.enrichSelected(req.body?.actor || 'admin', Number(req.body?.limit ?? 50))) };
}));

/** Finished actionable leads (enriched opportunities), newest/highest-priority first. */
roomsApi.get('/opportunities', (req, res) => handle(res, () => {
  const min = Number(req.query.minScore ?? 0);
  const rows = db.prepare(
    `SELECT o.*, c.trading_name AS company_name, c.domain AS company_domain, c.industry, c.employee_count,
            c.country AS company_country, c.verification_status AS company_verification,
            s.title AS signal_title, s.source_url AS signal_url, s.source_id AS signal_platform, s.signal_code
       FROM lead_opportunities o
       JOIN companies c ON c.id = o.company_id
       LEFT JOIN signal_events s ON s.id = o.signal_event_id
      WHERE o.priority_score >= ?
      ORDER BY o.priority_score DESC, o.updated_at DESC LIMIT 300`,
  ).all(min) as any[];
  const people = db.prepare(`SELECT * FROM people`).all() as any[];
  const byCompany = new Map<number, any[]>();
  for (const p of people) (byCompany.get(p.company_id) ?? byCompany.set(p.company_id, []).get(p.company_id))!.push(p);
  return {
    opportunities: rows.map((r) => ({
      ...r,
      people: byCompany.get(r.company_id) ?? [],
      actionable_lead: safeJson(r.actionable_lead_json, null),
    })),
  };
}));

roomsApi.post('/signals/:id/review', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  rooms.assertActive(room);
  const info = db.prepare(`UPDATE signal_events SET status='reviewed' WHERE id=? AND room_origin=?`).run(req.params.id, room);
  return { ok: true, reviewed: info.changes };
}));

roomsApi.post('/signals/:id/reject', (req, res) => handle(res, () => {
  const room = roomOrThrow(req.body?.room);
  rooms.assertActive(room);
  const info = db.prepare(`UPDATE signal_events SET status='rejected',rationale=COALESCE(?,rationale) WHERE id=? AND room_origin=?`)
    .run(req.body?.reason ?? null, req.params.id, room);
  return { ok: true, rejected: info.changes };
}));

roomsApi.post('/:room/run', (req, res) => handle(res, async () => {
  const room = roomOrThrow(req.params.room);
  rooms.assertActive(room);

  // Collector rooms: Room 1 (open-world discovery) + Rooms 3/4 (free-source catalog).
  const COLLECTOR_ROOMS: RoomMode[] = ['signal_room', 'referrals_room', 'community_monitoring_room'];
  const isFreeSourceRoom = room === 'referrals_room' || room === 'community_monitoring_room';
  const sourceCatalog = isFreeSourceRoom
    ? freeSourcesForRoom(room).map((s) => ({ id: s.id, name: s.name }))
    : room === 'signal_room'
      ? [{ id: 'signal_discovery', name: 'Strategy-driven web discovery' }]
      : [];
  const strategyId = String(req.body?.strategyId || '').trim();
  if (COLLECTOR_ROOMS.includes(room) && !strategyId) throw new Error('strategyId is required.');

  const requested = Array.isArray(req.body?.sourceIds) && req.body.sourceIds.length
    ? req.body.sourceIds.map(String)
    : sourceCatalog.map((source) => source.id);
  const selected = sourceCatalog.filter((source) => requested.includes(source.id));
  const run = db.prepare(`INSERT INTO room_runs (room,status,triggered_by,summary_json) VALUES (?,?,?,?)`)
    .run(room, 'running', req.body?.actor || 'admin', JSON.stringify({ strategyId, sources: selected.map((s) => s.id) }));

  if (!COLLECTOR_ROOMS.includes(room)) {
    db.prepare(`UPDATE room_runs SET status='completed',completed_at=datetime('now') WHERE id=?`).run(run.lastInsertRowid);
    return { ok: true, runId: run.lastInsertRowid, room, processed: 0, inserted: 0,
      message: 'This room does not run collectors. Room 2 enriches selected signals; Room 5 accepts manual intake.' };
  }

  const strategy = collectors.loadStrategy(strategyId);
  const sourceConfigs = req.body?.sourceConfigs && typeof req.body.sourceConfigs === 'object' ? req.body.sourceConfigs : {};
  const results: any[] = [];
  let totalCollected = 0;
  let totalInserted = 0;

  for (const source of selected) {
    const started = Date.now();
    try {
      const signals = await collectors.run(room, source.id, strategy, sourceConfigs[source.id] ?? {});
      const inserted = collectors.persist(room, strategy, signals);
      totalCollected += signals.length;
      totalInserted += inserted;
      results.push({ sourceId: source.id, ok: true, collected: signals.length, inserted, latencyMs: Date.now() - started });
    } catch (error: any) {
      results.push({ sourceId: source.id, ok: false, collected: 0, inserted: 0, error: error?.message ?? 'collector failed', latencyMs: Date.now() - started });
    }
  }

  db.prepare(`UPDATE room_runs SET status='completed',completed_at=datetime('now'),summary_json=? WHERE id=?`)
    .run(JSON.stringify({ strategyId, totalCollected, totalInserted, results }), run.lastInsertRowid);
  return {
    ok: true,
    runId: run.lastInsertRowid,
    room,
    collected: totalCollected,
    inserted: totalInserted,
    results,
    message: 'Configured live collectors executed. Manual-only sources accept evidence through imports or webhooks.',
  };
}));
