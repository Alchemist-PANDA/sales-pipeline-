# Production Crawling Subsystem

The public-research collectors sit on top of a production-grade crawl engine in
`server/src/crawl/`. Every fetch — whether triggered by a room collector, a
platform scraper, or the durable queue — runs through the same pipeline, so the
capabilities below apply system-wide rather than per source.

## Capabilities

| Capability | Module | What it does |
|---|---|---|
| **Queue management** | `queue.ts` | Durable, crash-safe fetch queue in SQLite. Priority ordering, idempotent enqueue, worker leasing with expiry (a crashed worker's lease is reclaimed — no lost or double work), dead-lettering, requeue, and purge. |
| **Retry logic** | `retry.ts` | Error classification (rate-limited / blocked / server / network / not-found / client / fatal) and exponential backoff with full jitter. Only retryable classes are retried; 404s are final. |
| **Rate limiting** | `scrapers/rateLimiter.ts` | Per-platform minimum jittered delay + concurrency cap. Sensitive hosts (LinkedIn, Glassdoor) are throttled harder. |
| **Caching** | `cache.ts` | Canonical-URL response cache with per-platform TTL. A fresh hit skips the browser entirely — the biggest lever for both speed and politeness. Shared across workers, survives restarts. |
| **Proxy management** | `proxyPool.ts` | Opt-in pool (`CRAWL_PROXIES` env). Round-robin over healthy proxies, per-proxy failure tracking, automatic cooldown on blocks, exhaustion alerting. "Where appropriate" — public sources fetch direct. |
| **Browser rendering** | `fetcher.ts` | Stealth headless Chromium via Playwright. Direct fetches reuse a shared browser pool; proxied fetches get an isolated browser so proxy identity never leaks into a direct request. |
| **Extraction templates** | `templates.ts` | Declarative CSS-selector templates (cheerio) matched by platform id then hostname. New sites are onboarded by adding a declaration, not a scraper. Built-ins cover SERP, directory, and article-list shapes. |
| **Duplicate-page detection** | `cache.ts` + `urlNormalizer.ts` | Content-hash index. Identical content served under a different URL is flagged as a duplicate (mirror pages, paginated dupes, soft-404 templates). |
| **Canonical URL normalization** | `urlNormalizer.ts` | https upgrade, host lowercasing, tracking-param stripping, query sorting, fragment/trailing-slash/mobile/AMP collapse. Same resource → one canonical form → one cache key → one queue entry. |
| **Anti-bot failure handling** | `antibot.ts` | Inspects body + status for Cloudflare / reCAPTCHA / hCaptcha / DataDome / PerimeterX / Akamai / rate-wall / login-wall / empty-interstitial signatures. A 200 that is really a wall is treated as blocked → rotate + back off. |
| **Monitoring + alerting** | `metrics.ts` | Per-minute counters (fetch_ok/fail, cache_hit, blocked, retry, dead, dup_page). Rolling-window aggregation. Alert conditions (block-rate spike, failure-rate spike, dead-letter growth, proxy exhaustion) fan out to console + DB + optional webhook (`CRAWL_ALERT_WEBHOOK`), debounced. |

## The pipeline

A single `ProductionCrawler.fetch()` runs:

```
normalize URL
  → cache lookup (fresh hit short-circuits)
  → per-platform rate limit
  → stealth browser render (± proxy)
  → anti-bot inspection (block → rotate + back off)
  → cache store + duplicate-page detection
  → template extraction
  → metrics
        (retryable failure → backoff + requeue; exhausted → dead-letter)
```

`drain()` runs the durable queue with bounded concurrency, reschedules retryable
failures, dead-letters exhausted ones, and evaluates alerts each pass. Because
all queue state is in SQLite, a restart resumes exactly where it left off.

## Backwards compatibility

The legacy `runScrape()` in `scrapers/engine.ts` now delegates to this
subsystem, so the existing per-platform scrapers gain caching, retry, dedup, and
metrics without any change to their `extract(page)` callbacks.

## API (monitoring + control)

| Endpoint | Purpose |
|---|---|
| `GET /api/crawl/health` | Full snapshot: queue, cache, proxies, metrics, recent alerts. |
| `GET /api/crawl/metrics?mins=15` | Rolling metric window. |
| `GET /api/crawl/alerts` | Recent alert log. |
| `POST /api/crawl/enqueue` | Queue URLs `{ items: [{ platformId, url, priority? }] }` (deduped). |
| `POST /api/crawl/drain` | Drain the queue `{ maxTasks?, concurrency?, useProxy? }`. |
| `POST /api/crawl/requeue-dead` | Revive dead-lettered tasks `{ platformId? }`. |
| `POST /api/crawl/housekeep` | Evict expired cache + purge old completed rows. |

## Configuration

| Env var | Effect |
|---|---|
| `CRAWL_PROXIES` | Comma/newline-separated proxy URLs. Absent → all fetches go direct. |
| `CRAWL_ALERT_WEBHOOK` | POST endpoint for alert fan-out (Slack/pager/n8n). Absent → console + DB only. |
| `PLAYWRIGHT_EXECUTABLE_PATH` | Override Chromium binary location. |

## Scope

Single-process, SQLite-backed — deliberately sized for a 30-person team's volume
with zero external infrastructure (no Redis/Kafka). The access layer is isolated
so the queue/cache/metrics tables can move to Postgres if volume ever demands it.
