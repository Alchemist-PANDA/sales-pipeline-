/**
 * Strategy API — create, list, activate, update, delete targeting strategies.
 * Every collector run and enrichment pass requires an active strategy.
 *
 *   GET  /strategies              list all (active first)
 *   GET  /strategies/active       the currently active strategy
 *   POST /strategies              create { name, product, pains[], signals[], industries[], countries[], ... }
 *   POST /strategies/:id/activate make this the single active strategy
 *   PUT  /strategies/:id          update
 *   DELETE /strategies/:id        remove
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { StrategyStore } from '../services/strategyStore.js';

export const strategiesApi = Router();
const store = new StrategyStore(db);

function handle(res: any, fn: () => unknown) {
  Promise.resolve().then(fn).then((r) => res.json(r)).catch((e: any) => res.status(400).json({ error: e?.message ?? 'request failed' }));
}

strategiesApi.get('/', (_req, res) => handle(res, () => ({ strategies: store.list(), active: store.getActive() })));
strategiesApi.get('/active', (_req, res) => handle(res, () => ({ active: store.getActive() })));
strategiesApi.post('/', (req, res) => handle(res, () => ({ ok: true, strategy: store.create(req.body ?? {}) })));
strategiesApi.post('/:id/activate', (req, res) => handle(res, () => ({ ok: true, strategy: store.activate(req.params.id) })));
strategiesApi.put('/:id', (req, res) => handle(res, () => ({ ok: true, strategy: store.update(req.params.id, req.body ?? {}) })));
strategiesApi.delete('/:id', (req, res) => handle(res, () => { store.remove(req.params.id); return { ok: true }; }));
