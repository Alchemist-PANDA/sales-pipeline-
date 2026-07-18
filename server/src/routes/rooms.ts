/**
 * Three-room API routes. Backend-enforced: only one room active at a time.
 *
 * Room control:
 *   GET  /rooms/state          — current room state
 *   POST /rooms/activate       — activate a room (body: { room: 1|2|3 })
 *   POST /rooms/deactivate     — go idle
 *
 * Room 1 — Signal Room (crawl → detect → collect):
 *   POST /rooms/1/run          — trigger signal crawl (requires active strategy)
 *   GET  /rooms/1/signals      — signals detected in Room 1
 *   POST /rooms/1/:id/review   — mark as reviewed
 *   POST /rooms/1/:id/reject   — reject signal
 *
 * Room 2 — Selection + Enrichment:
 *   GET  /rooms/2/signals      — signals awaiting selection (new + reviewed from Room 1)
 *   POST /rooms/2/select       — select signals for enrichment (body: { ids: number[] })
 *   POST /rooms/2/enrich       — enrich all selected signals
 *
 * Room 3 — Manual Signal Room:
 *   POST /rooms/3/create       — operator submits a signal manually
 *   GET  /rooms/3/signals      — signals entered in Room 3
 *   POST /rooms/3/:id/enrich   — enrich a specific manual signal
 *
 * Strategy:
 *   GET  /strategies           — list strategies
 *   POST /strategies           — create strategy
 *   POST /strategies/:id/activate — set as active strategy
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { RoomControl, RoomConflictError, RoomNotActiveError, RoomId } from '../core/rooms.js';
import { SignalEventsService } from '../services/signalEvents.js';
import { StrategyService } from '../services/strategy.js';
import { SIGNALS } from '../core/signals.js';
import { AccountPool } from '../core/pool.js';
import { getConnector } from '../connectors/index.js';
import { PLATFORMS, SIGNAL_PRIORITY_ORDER } from '../core/registry.js';

export const roomsRouter = Router();
const rooms = new RoomControl(db);
const signalEvents = new SignalEventsService(db);
const strategies = new StrategyService(db);
const pool = new AccountPool(db);

// ── Room control ──────────────────────────────────────────────────────────────

roomsRouter.get('/rooms/state', (_req, res) => {
  res.json({ ...rooms.getStatus(), signalStats: signalEvents.stats() });
});

roomsRouter.post('/rooms/activate', (req, res) => {
  const { room } = req.body;
  if (![1, 2, 3].includes(room)) return res.status(400).json({ error: 'room must be 1, 2, or 3' });
  try {
    res.json(rooms.activate(room as RoomId));
  } catch (e: any) {
    if (e instanceof RoomConflictError) return res.status(409).json({ error: e.message });
    throw e;
  }
});

roomsRouter.post('/rooms/deactivate', (_req, res) => {
  res.json(rooms.deactivate());
});

// ── Room 1 — Signal Room ──────────────────────────────────────────────────────

roomsRouter.post('/rooms/1/run', async (req, res) => {
  try {
    rooms.assertActive(1);
  } catch (e: any) {
    if (e instanceof RoomNotActiveError) return res.status(403).json({ error: e.message });
    throw e;
  }

  const strategy = strategies.getActive();
  if (!strategy) return res.status(400).json({ error: 'No active strategy. Create and activate a strategy first.' });

  const platforms = req.body?.platforms as string[] | undefined;
  const targetPlatforms = platforms?.length
    ? SIGNAL_PRIORITY_ORDER.filter(p => platforms.includes(p.id))
    : SIGNAL_PRIORITY_ORDER;

  const detected: number[] = [];

  for (const platform of targetPlatforms) {
    const lease = pool.lease(platform.id);
    if (!lease) continue;

    const connector = getConnector(platform.id);
    const input = { company: strategy.name, domain: strategy.industries[0] ?? '' };

    try {
      const result = await connector.enrich(input, lease.account);
      lease.release(true, {});

      for (const ev of result.evidence) {
        const matchedSignals = SIGNALS.filter(s =>
          s.platforms.includes(platform.id) &&
          s.match?.some(m => ev.toLowerCase().includes(m))
        );

        for (const sig of matchedSignals) {
          if (strategy.product !== 'BOTH' && sig.product !== 'BOTH' && sig.product !== strategy.product) continue;

          const id = signalEvents.create({
            signal_code: sig.code,
            title: sig.title,
            company_name: input.company,
            company_domain: input.domain || undefined,
            source_url: `https://${platform.id}.com/result`,
            source_platform: platform.id,
            evidence: ev,
            strength: sig.weight,
            room_origin: 1,
            strategy_id: strategy.id,
          });
          detected.push(id);
        }
      }
    } catch {
      lease.release(false, { rateLimited: true });
    }
  }

  res.json({ detected: detected.length, signalIds: detected, strategy: strategy.name });
});

roomsRouter.get('/rooms/1/signals', (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json({ signals: signalEvents.byRoom(1, limit) });
});

roomsRouter.post('/rooms/1/:id/review', (req, res) => {
  signalEvents.review(Number(req.params.id));
  res.json({ ok: true });
});

roomsRouter.post('/rooms/1/:id/reject', (req, res) => {
  signalEvents.reject(Number(req.params.id));
  res.json({ ok: true });
});

// ── Room 2 — Selection + Enrichment ──────────────────────────────────────────

roomsRouter.get('/rooms/2/signals', (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const signals = signalEvents.inbox(['new', 'reviewed', 'selected'], limit);
  res.json({ signals });
});

roomsRouter.post('/rooms/2/select', (req, res) => {
  try {
    rooms.assertActive(2);
  } catch (e: any) {
    if (e instanceof RoomNotActiveError) return res.status(403).json({ error: e.message });
    throw e;
  }

  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  const count = signalEvents.selectBatch(ids);
  res.json({ selected: count });
});

roomsRouter.post('/rooms/2/enrich', async (req, res) => {
  try {
    rooms.assertActive(2);
  } catch (e: any) {
    if (e instanceof RoomNotActiveError) return res.status(403).json({ error: e.message });
    throw e;
  }

  const selected = signalEvents.inbox('selected', 50);
  if (!selected.length) return res.json({ enriched: 0, message: 'No selected signals to enrich' });

  let enriched = 0;
  for (const sig of selected) {
    signalEvents.startEnrichment(sig.id);

    const input = {
      company: sig.company_name ?? sig.title,
      domain: sig.company_domain ?? undefined,
    };

    const enrichData: Record<string, unknown> = { signal: sig.signal_code, source: sig.source_platform };

    for (const platform of PLATFORMS.filter(p => p.provides.includes('contact_data'))) {
      const lease = pool.lease(platform.id);
      if (!lease) continue;

      try {
        const connector = getConnector(platform.id);
        const result = await connector.enrich(input, lease.account);
        lease.release(!result.rateLimited, { rateLimited: result.rateLimited });

        if (!result.rateLimited) {
          const { evidence: _ev, rateLimited: _rl, ...fields } = result;
          Object.assign(enrichData, fields);
          break;
        }
      } catch {
        lease.release(false, { rateLimited: true });
      }
    }

    signalEvents.completeEnrichment(sig.id, enrichData);
    enriched++;
  }

  res.json({ enriched });
});

// ── Room 3 — Manual Signal Room ──────────────────────────────────────────────

roomsRouter.post('/rooms/3/create', (req, res) => {
  try {
    rooms.assertActive(3);
  } catch (e: any) {
    if (e instanceof RoomNotActiveError) return res.status(403).json({ error: e.message });
    throw e;
  }

  const { signal_code, title, company_name, company_domain, source_url, source_platform, evidence, strength } = req.body;
  if (!source_url || !source_platform || !evidence) {
    return res.status(400).json({ error: 'source_url, source_platform, and evidence are mandatory' });
  }
  if (!signal_code || !title) {
    return res.status(400).json({ error: 'signal_code and title are required' });
  }

  const id = signalEvents.create({
    signal_code,
    title,
    company_name,
    company_domain,
    source_url,
    source_platform,
    evidence,
    strength: strength ?? 5,
    room_origin: 3,
  });

  res.json({ id });
});

roomsRouter.get('/rooms/3/signals', (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json({ signals: signalEvents.byRoom(3, limit) });
});

roomsRouter.post('/rooms/3/:id/enrich', async (req, res) => {
  try {
    rooms.assertActive(3);
  } catch (e: any) {
    if (e instanceof RoomNotActiveError) return res.status(403).json({ error: e.message });
    throw e;
  }

  const sig = signalEvents.getById(Number(req.params.id));
  if (!sig) return res.status(404).json({ error: 'Signal not found' });
  if (sig.room_origin !== 3) return res.status(400).json({ error: 'Signal is not from Room 3' });

  signalEvents.startEnrichment(sig.id);

  const input = { company: sig.company_name ?? sig.title, domain: sig.company_domain ?? undefined };
  const enrichData: Record<string, unknown> = { signal: sig.signal_code, source: sig.source_platform };

  for (const platform of PLATFORMS.filter(p => p.provides.includes('contact_data'))) {
    const lease = pool.lease(platform.id);
    if (!lease) continue;

    try {
      const connector = getConnector(platform.id);
      const result = await connector.enrich(input, lease.account);
      lease.release(!result.rateLimited, { rateLimited: result.rateLimited });

      if (!result.rateLimited) {
          const { evidence: _ev, rateLimited: _rl, ...fields } = result;
          Object.assign(enrichData, fields);
          break;
        }
    } catch {
      lease.release(false, { rateLimited: true });
    }
  }

  signalEvents.completeEnrichment(sig.id, enrichData);
  res.json({ enriched: true, data: enrichData });
});

// ── Strategies ────────────────────────────────────────────────────────────────

roomsRouter.get('/strategies', (_req, res) => {
  res.json({ strategies: strategies.list(), active: strategies.getActive() });
});

roomsRouter.post('/strategies', (req, res) => {
  const { name, product, pains, customer_types, regions, industries, exclusions, employee_min, employee_max } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = strategies.create({ name, product, pains, customer_types, regions, industries, exclusions, employee_min, employee_max });
  res.json({ id });
});

roomsRouter.post('/strategies/:id/activate', (req, res) => {
  strategies.activate(Number(req.params.id));
  res.json({ ok: true });
});
