/**
 * Retry policy + error classification.
 *
 * Not every failure deserves a retry. A 404 is final; a 429 or a timeout is
 * transient and should back off. This module classifies an error/response into
 * one of a few buckets and computes the next-attempt delay with exponential
 * backoff + full jitter (jitter avoids retry stampedes across the pool).
 */

export type ErrorClass =
  | 'ok'
  | 'rate_limited'   // 429 / explicit throttle — back off hard, rotate identity
  | 'blocked'        // anti-bot challenge / 403 block page — rotate proxy+session
  | 'server_error'   // 5xx — transient, retry
  | 'network'        // DNS/connreset/timeout — transient, retry
  | 'not_found'      // 404/410 — permanent, do not retry
  | 'client_error'   // other 4xx — permanent
  | 'fatal';         // unexpected — permanent

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 4,
  baseDelayMs: 2000,
  maxDelayMs: 60_000,
};

const RETRYABLE: ReadonlySet<ErrorClass> = new Set<ErrorClass>([
  'rate_limited', 'blocked', 'server_error', 'network',
]);

export function isRetryable(cls: ErrorClass): boolean {
  return RETRYABLE.has(cls);
}

/** Map an HTTP status to an error class. */
export function classifyStatus(status: number): ErrorClass {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 429) return 'rate_limited';
  if (status === 403) return 'blocked';
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'server_error';
}

/** Map a thrown error (no HTTP response) to an error class. */
export function classifyError(err: unknown): ErrorClass {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/timeout|timed out|etimedout/.test(msg)) return 'network';
  if (/econnreset|econnrefused|enotfound|eai_again|socket hang up|dns/.test(msg)) return 'network';
  if (/net::err/.test(msg)) return 'network';
  if (/navigation|goto/.test(msg)) return 'network';
  return 'fatal';
}

/**
 * Exponential backoff with full jitter.
 *   delay = random(0, min(maxDelay, base * 2^attempt))
 * A `rate_limited` class gets an extra multiplier so throttled hosts get real
 * breathing room rather than another hit two seconds later.
 */
export function backoffMs(attempt: number, cls: ErrorClass, cfg: RetryConfig = DEFAULT_RETRY): number {
  const penalty = cls === 'rate_limited' ? 4 : cls === 'blocked' ? 2 : 1;
  const ceiling = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * penalty * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}
