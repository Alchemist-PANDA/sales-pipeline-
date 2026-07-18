/**
 * Crawl subsystem API — monitoring, queue control, and manual draining.
 *
 *   GET  /crawl/health          full subsystem snapshot (queue, cache, proxies, metrics, alerts)
 *   GET  /crawl/metrics?mins=15 rolling metric window
 *   GET  /crawl/alerts          recent alert log
 *   POST /crawl/enqueue         queue URLs { items: [{ platformId, url, priority? }] }
 *   POST /crawl/drain           drain the queue { maxTasks?, concurrency?, useProxy? }
 *   POST /crawl/requeue-dead    revive dead-lettered tasks { platformId? }
 *   POST /crawl/housekeep       evict expired cache + purge old completed rows
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { getCrawler } from '../crawl/crawler.js';

export const crawlApi = Router();
const crawler = getCrawler(db);

function handle(res: any, fn: () => unknown | Promise<unknown>) {
  Promise.resolve().then(fn).then((r) => res.json(r)).catch((e: any) => res.status(400).json({ error: e?.message ?? 'request failed' }));
}

crawlApi.get('/health', (_req, res) => handle(res, () => crawler.health()));

crawlApi.get('/metrics', (req, res) => handle(res, () => crawler.metrics.window(Number(req.query.mins ?? 15))));

crawlApi.get('/alerts', (req, res) => handle(res, () => ({ alerts: crawler.metrics.recentAlerts(Number(req.query.limit ?? 50)) })));

crawlApi.post('/enqueue', (req, res) => handle(res, () => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw new Error('items[] required');
  const normalized = items
    .filter((x: any) => x?.platformId && x?.url)
    .map((x: any) => ({ platformId: String(x.platformId), url: String(x.url), priority: x.priority, maxAttempts: x.maxAttempts }));
  return crawler.enqueue(normalized);
}));

crawlApi.post('/drain', (req, res) => handle(res, () => crawler.drain({
  maxTasks: req.body?.maxTasks, concurrency: req.body?.concurrency, useProxy: req.body?.useProxy,
})));

crawlApi.post('/requeue-dead', (req, res) => handle(res, () => ({ requeued: crawler.queue.requeueDead(req.body?.platformId) })));

crawlApi.post('/housekeep', (_req, res) => handle(res, () => crawler.housekeep()));
