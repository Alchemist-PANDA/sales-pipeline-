/**
 * ============================================================================
 *  PRODUCTION CRAWLER  —  the orchestrator that ties the subsystem together
 * ============================================================================
 *
 * A single `fetch()` here runs the full production pipeline for one URL:
 *
 *   normalize → cache lookup → rate-limit → browser render (± proxy)
 *     → anti-bot check → cache store + dup detection → template extract
 *     → metrics                                     (retry/backoff on failure)
 *
 * `drain()` runs the durable queue: it leases ready tasks, fetches them with
 * bounded concurrency, reschedules retryable failures with backoff, dead-letters
 * exhausted ones, and evaluates alert conditions each pass. Everything is
 * crash-safe because queue state lives in SQLite.
 *
 * This is additive: the legacy `runScrape` in scrapers/engine.ts now delegates
 * here, so existing platform scrapers gain caching/retry/dedup/metrics for free.
 */

import type Database from 'better-sqlite3';
import { migrateCrawl } from './schema.js';
import { normalizeUrl } from './urlNormalizer.js';
import { CrawlCache } from './cache.js';
import { CrawlQueue, EnqueueInput } from './queue.js';
import { CrawlMetrics } from './metrics.js';
import { ProxyPool, defaultProxyPool } from './proxyPool.js';
import { renderFetch } from './fetcher.js';
import { detectBlock } from './antibot.js';
import { classifyStatus, classifyError, ErrorClass } from './retry.js';
import { extractFromHtml, ExtractedRow } from './templates.js';
import { throttled } from '../scrapers/rateLimiter.js';

export interface CrawlRequest {
  platformId: string;
  url: string;
  cookies?: { name: string; value: string; domain: string; path?: string }[];
  useProxy?: boolean;         // opt in to the proxy pool for this fetch
  forceRefresh?: boolean;     // bypass a fresh cache entry
  timeoutMs?: number;
}

export interface CrawlOutcome {
  ok: boolean;
  url: string;
  canonicalUrl: string;
  status: number;
  fromCache: boolean;
  duplicate: boolean;
  blocked: boolean;
  blockKind?: string;
  errorClass?: ErrorClass;
  rows: ExtractedRow[];
  html?: string;
  error?: string;
}

export class ProductionCrawler {
  readonly cache: CrawlCache;
  readonly queue: CrawlQueue;
  readonly metrics: CrawlMetrics;
  private readonly proxies: ProxyPool;

  constructor(private db: Database.Database, opts?: { proxies?: ProxyPool }) {
    migrateCrawl(db);
    this.cache = new CrawlCache(db);
    this.queue = new CrawlQueue(db);
    this.metrics = new CrawlMetrics(db);
    this.proxies = opts?.proxies ?? defaultProxyPool;
  }

  /**
   * Fetch one URL through the full pipeline. Never throws — failures come back
   * as an outcome with `ok:false` and a classified error so callers (and the
   * queue) can decide whether to retry.
   */
  async fetch(req: CrawlRequest): Promise<CrawlOutcome> {
    const norm = normalizeUrl(req.url);
    if (!norm) {
      return { ok: false, url: req.url, canonicalUrl: req.url, status: 0, fromCache: false,
        duplicate: false, blocked: false, errorClass: 'fatal', rows: [], error: 'unfetchable URL' };
    }

    // 1. Cache lookup (fresh hit short-circuits the fetch).
    if (!req.forceRefresh) {
      const cached = this.cache.get(norm.canonical);
      if (cached?.fresh && cached.body) {
        this.metrics.record(req.platformId, 'cache_hit');
        return {
          ok: true, url: req.url, canonicalUrl: norm.canonical, status: cached.statusCode ?? 200,
          fromCache: true, duplicate: false, blocked: false,
          rows: extractFromHtml(req.platformId, norm.hostname, cached.body, norm.canonical),
          html: cached.body,
        };
      }
    }

    // 2. Proxy selection (opt-in, "where appropriate").
    const proxy = req.useProxy ? this.proxies.acquire() : null;

    // 3. Rate-limited, browser-rendered fetch.
    const started = Date.now();
    try {
      const res = await throttled(req.platformId, () =>
        renderFetch({ url: norm.canonical, platformId: req.platformId, cookies: req.cookies, proxy, timeoutMs: req.timeoutMs }),
      );

      // 4. Anti-bot inspection — a 200 can still be a wall.
      const verdict = detectBlock(res.status, res.body);
      if (verdict.blocked) {
        if (proxy) this.proxies.report(proxy.url, 'blocked');
        this.metrics.record(req.platformId, 'blocked', Date.now() - started);
        return { ok: false, url: req.url, canonicalUrl: norm.canonical, status: res.status, fromCache: false,
          duplicate: false, blocked: true, blockKind: verdict.kind, errorClass: verdict.errorClass ?? 'blocked',
          rows: [], html: res.body, error: `anti-bot wall: ${verdict.kind}` };
      }

      const cls = classifyStatus(res.status);
      if (cls !== 'ok') {
        if (proxy) this.proxies.report(proxy.url, cls === 'blocked' || cls === 'rate_limited' ? 'blocked' : 'error');
        this.metrics.record(req.platformId, 'fetch_fail', Date.now() - started);
        return { ok: false, url: req.url, canonicalUrl: norm.canonical, status: res.status, fromCache: false,
          duplicate: false, blocked: false, errorClass: cls, rows: [], html: res.body, error: `HTTP ${res.status}` };
      }

      // 5. Success — cache + dedup + extract.
      if (proxy) this.proxies.report(proxy.url, 'ok');
      const { duplicate } = this.cache.put({
        canonicalUrl: norm.canonical, platformId: req.platformId, statusCode: res.status,
        body: res.body, headers: res.headers,
      });
      if (duplicate) this.metrics.record(req.platformId, 'dup_page');
      this.metrics.record(req.platformId, 'fetch_ok', Date.now() - started);

      return {
        ok: true, url: req.url, canonicalUrl: norm.canonical, status: res.status, fromCache: false,
        duplicate, blocked: false,
        rows: extractFromHtml(req.platformId, norm.hostname, res.body, norm.canonical),
        html: res.body,
      };
    } catch (err) {
      const cls = classifyError(err);
      if (proxy) this.proxies.report(proxy.url, 'error');
      this.metrics.record(req.platformId, 'fetch_fail', Date.now() - started);
      return { ok: false, url: req.url, canonicalUrl: norm.canonical, status: 0, fromCache: false,
        duplicate: false, blocked: false, errorClass: cls, rows: [],
        error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Queue URLs for background draining (idempotent + deduped). */
  enqueue(inputs: EnqueueInput[]) {
    const result = this.queue.enqueueMany(inputs);
    for (let i = 0; i < result.queued; i++) this.metrics.record(inputs[i]?.platformId ?? 'unknown', 'enqueued');
    return result;
  }

  /**
   * Drain the durable queue with bounded concurrency. Leases ready tasks, fetches
   * them, reschedules retryable failures, dead-letters exhausted ones, and checks
   * alerts. Returns a summary. Safe to call repeatedly (a worker loop / cron).
   */
  async drain(opts: { maxTasks?: number; concurrency?: number; useProxy?: boolean } = {}): Promise<{
    processed: number; ok: number; retried: number; dead: number; blocked: number; rows: ExtractedRow[];
  }> {
    const maxTasks = opts.maxTasks ?? 50;
    const concurrency = Math.max(1, opts.concurrency ?? 3);
    let processed = 0, ok = 0, retried = 0, dead = 0, blocked = 0;
    const rows: ExtractedRow[] = [];

    const worker = async () => {
      while (processed < maxTasks) {
        const task = this.queue.lease();
        if (!task) return;
        processed++;
        const outcome = await this.fetch({
          platformId: task.platformId, url: task.url, useProxy: opts.useProxy,
          ...(task.payload as object),
        });
        if (outcome.ok) {
          this.queue.complete(task.id);
          ok++;
          rows.push(...outcome.rows);
        } else {
          if (outcome.blocked) blocked++;
          const disposition = this.queue.fail(task, outcome.errorClass ?? 'fatal', outcome.error ?? 'unknown');
          if (disposition === 'retry') { retried++; this.metrics.record(task.platformId, 'retry'); }
          else { dead++; this.metrics.record(task.platformId, 'dead'); }
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    await this.metrics.evaluateAlerts({
      deadLetterCount: this.queue.deadLetterCount(),
      proxyExhausted: this.proxies.exhausted,
    });
    return { processed, ok, retried, dead, blocked, rows };
  }

  /** Full health snapshot for the monitoring endpoint. */
  health() {
    return {
      queue: this.queue.stats(),
      cache: this.cache.stats(),
      proxies: this.proxies.snapshot(),
      metrics: this.metrics.window(15),
      alerts: this.metrics.recentAlerts(20),
    };
  }

  /** Housekeeping: evict expired cache + purge old completed queue rows. */
  housekeep() {
    return {
      cacheEvicted: this.cache.evictExpired(),
      queuePurged: this.queue.purgeCompleted(),
    };
  }
}

let singleton: ProductionCrawler | null = null;
export function getCrawler(db: Database.Database): ProductionCrawler {
  if (!singleton) singleton = new ProductionCrawler(db);
  return singleton;
}
