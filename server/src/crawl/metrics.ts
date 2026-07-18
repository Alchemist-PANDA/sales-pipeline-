/**
 * Monitoring + alerting for the crawl subsystem.
 *
 * Every fetch outcome is counted into a per-minute bucket in `crawl_metrics`
 * (cheap upsert). On top of the raw counters we evaluate a handful of alert
 * conditions — a spike in blocks, a growing dead-letter pile, proxy exhaustion —
 * and fan any trip out to configured sinks: always the DB + console, plus an
 * optional webhook (CRAWL_ALERT_WEBHOOK) so it can reach Slack/pager/n8n.
 */

import type Database from 'better-sqlite3';

export type CrawlMetric =
  | 'fetch_ok' | 'fetch_fail' | 'cache_hit' | 'blocked' | 'retry' | 'dead' | 'dup_page' | 'enqueued';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertSink {
  emit(alert: { severity: AlertSeverity; kind: string; platformId?: string; detail?: string }): void | Promise<void>;
}

function minuteBucket(now = Date.now()): number {
  return Math.floor(now / 60_000) * 60_000;
}

/** Console sink — always on. */
const consoleSink: AlertSink = {
  emit(a) {
    const tag = a.severity === 'critical' ? '🚨' : a.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
    console.warn(`${tag}[crawl-alert] ${a.kind}${a.platformId ? ` (${a.platformId})` : ''}: ${a.detail ?? ''}`);
  },
};

/** Optional webhook sink — POSTs JSON if CRAWL_ALERT_WEBHOOK is set. */
function webhookSink(): AlertSink | null {
  const url = process.env.CRAWL_ALERT_WEBHOOK;
  if (!url) return null;
  return {
    async emit(a) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...a, source: 'signal-forge-crawler', at: new Date().toISOString() }),
        });
      } catch {
        /* alerting must never throw into the crawl path */
      }
    },
  };
}

export class CrawlMetrics {
  private sinks: AlertSink[];
  private upsert;
  private lastAlertAt = new Map<string, number>();
  private readonly alertDebounceMs = 5 * 60_000;

  constructor(private db: Database.Database, extraSinks: AlertSink[] = []) {
    this.sinks = [consoleSink, ...(webhookSink() ? [webhookSink()!] : []), ...extraSinks];
    this.upsert = db.prepare(`
      INSERT INTO crawl_metrics (bucket, platform_id, metric, count, sum_ms)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(bucket, platform_id, metric)
      DO UPDATE SET count = count + 1, sum_ms = sum_ms + excluded.sum_ms
    `);
  }

  record(platformId: string, metric: CrawlMetric, ms = 0): void {
    this.upsert.run(minuteBucket(), platformId, metric, Math.max(0, Math.round(ms)));
  }

  /** Aggregate counters over the last `windowMinutes`. */
  window(windowMinutes = 15) {
    const since = minuteBucket() - windowMinutes * 60_000;
    const rows = this.db.prepare(`
      SELECT platform_id, metric, SUM(count) AS count, SUM(sum_ms) AS sum_ms
      FROM crawl_metrics WHERE bucket >= ? GROUP BY platform_id, metric
    `).all(since) as { platform_id: string; metric: CrawlMetric; count: number; sum_ms: number }[];

    const byPlatform: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    let totalMs = 0;
    let okCount = 0;
    for (const r of rows) {
      (byPlatform[r.platform_id] ??= {})[r.metric] = r.count;
      totals[r.metric] = (totals[r.metric] ?? 0) + r.count;
      if (r.metric === 'fetch_ok') { totalMs += r.sum_ms; okCount += r.count; }
    }
    return {
      windowMinutes,
      totals,
      byPlatform,
      avgFetchMs: okCount ? Math.round(totalMs / okCount) : 0,
    };
  }

  /** Evaluate alert conditions and fire any that trip (debounced per kind). */
  async evaluateAlerts(opts: { deadLetterCount: number; proxyExhausted: boolean }): Promise<void> {
    const w = this.window(15);
    const blocked = w.totals.blocked ?? 0;
    const ok = w.totals.fetch_ok ?? 0;
    const fail = w.totals.fetch_fail ?? 0;

    // Block rate: >30% of attempts blocked over the window (min volume 10).
    const attempts = ok + fail + blocked;
    if (attempts >= 10 && blocked / attempts > 0.3) {
      await this.fire('critical', 'block_rate_high', undefined,
        `${blocked}/${attempts} attempts blocked in last 15m — rotate proxies/sessions or slow down`);
    }

    // Failure rate: >50% failures over the window (min volume 10).
    if (attempts >= 10 && fail / attempts > 0.5) {
      await this.fire('warning', 'failure_rate_high', undefined,
        `${fail}/${attempts} fetches failing in last 15m`);
    }

    // Dead-letter growth.
    if (opts.deadLetterCount >= 25) {
      await this.fire('warning', 'dead_letter_growth', undefined,
        `${opts.deadLetterCount} URLs exhausted all retries and are dead-lettered`);
    }

    // Proxy exhaustion.
    if (opts.proxyExhausted) {
      await this.fire('critical', 'proxy_pool_exhausted', undefined,
        'every configured proxy is cooling down — crawling is stalled');
    }
  }

  private async fire(severity: AlertSeverity, kind: string, platformId: string | undefined, detail: string) {
    const key = `${kind}:${platformId ?? '*'}`;
    const now = Date.now();
    if ((this.lastAlertAt.get(key) ?? 0) + this.alertDebounceMs > now) return; // debounce
    this.lastAlertAt.set(key, now);

    this.db.prepare(`INSERT INTO crawl_alerts (severity, kind, platform_id, detail) VALUES (?,?,?,?)`)
      .run(severity, kind, platformId ?? null, detail);
    await Promise.all(this.sinks.map((s) => Promise.resolve(s.emit({ severity, kind, platformId, detail })).catch(() => {})));
  }

  recentAlerts(limit = 50) {
    return this.db.prepare(`SELECT * FROM crawl_alerts ORDER BY id DESC LIMIT ?`).all(limit);
  }
}
