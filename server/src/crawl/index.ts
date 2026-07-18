/**
 * Production crawl subsystem — public surface.
 *
 * Capabilities: durable queue management, retry with backoff, per-platform rate
 * limiting, response caching, opt-in proxy management, browser rendering,
 * declarative extraction templates, duplicate-page detection, canonical URL
 * normalization, anti-bot failure handling, and monitoring + alerting.
 */

export { ProductionCrawler, getCrawler } from './crawler.js';
export type { CrawlRequest, CrawlOutcome } from './crawler.js';
export { migrateCrawl } from './schema.js';
export { normalizeUrl, contentHash } from './urlNormalizer.js';
export { CrawlCache, ttlFor } from './cache.js';
export { CrawlQueue } from './queue.js';
export type { EnqueueInput, LeasedTask } from './queue.js';
export { CrawlMetrics } from './metrics.js';
export type { AlertSink, AlertSeverity, CrawlMetric } from './metrics.js';
export { ProxyPool, defaultProxyPool } from './proxyPool.js';
export type { ProxyEndpoint } from './proxyPool.js';
export { detectBlock } from './antibot.js';
export { classifyStatus, classifyError, backoffMs, isRetryable, DEFAULT_RETRY } from './retry.js';
export type { ErrorClass, RetryConfig } from './retry.js';
export { TEMPLATES, selectTemplate, applyTemplate, extractFromHtml } from './templates.js';
export type { ExtractionTemplate, ExtractedRow, FieldSpec } from './templates.js';
export { renderFetch } from './fetcher.js';
export type { FetchInput, FetchOutcome } from './fetcher.js';
