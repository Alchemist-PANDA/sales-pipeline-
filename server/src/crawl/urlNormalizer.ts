/**
 * Canonical URL normalization + dedup keys.
 *
 * Two URLs that point at the same resource must collapse to one canonical form
 * so we don't fetch (or queue) the same page twice under a hundred tracking-
 * parameter permutations. The canonical form is also the cache key and the base
 * of the queue dedup key.
 */

import crypto from 'node:crypto';

/** Query params that never change the resource — safe to drop entirely. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src',
  'ref_url', 'source', 'cmpid', 'campaign', '_hsenc', '_hsmi', 'vero_id', 'yclid',
  'spm', 'scm', 'trk', 'trkCampaign', 'originalSubdomain', 'sessionid', 'sid',
]);

/** Hosts where a trailing "/amp" or "m." subdomain is the same logical page. */
function stripMobileAndAmp(hostname: string, pathname: string): { hostname: string; pathname: string } {
  let h = hostname;
  if (h.startsWith('m.')) h = h.slice(2);
  if (h.startsWith('mobile.')) h = h.slice(7);
  let p = pathname;
  if (p.endsWith('/amp')) p = p.slice(0, -4);
  if (p.endsWith('/amp/')) p = p.slice(0, -5);
  return { hostname: h, pathname: p };
}

export interface NormalizedUrl {
  canonical: string;
  hostname: string;
  dedupKey: string;
}

/**
 * Produce a canonical URL: lowercased host, no tracking params, sorted query,
 * no fragment, collapsed trailing slash, http→https upgrade. Returns null for
 * anything that isn't a fetchable http(s) URL.
 */
export function normalizeUrl(raw: string, base?: string): NormalizedUrl | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  // Force https — the vast majority of targets redirect http→https anyway, and
  // treating them as one avoids double-fetching.
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';
  // Drop default ports.
  if (u.port === '80' || u.port === '443') u.port = '';

  const { hostname, pathname } = stripMobileAndAmp(u.hostname, u.pathname);
  u.hostname = hostname;
  // Collapse duplicate slashes and a lone trailing slash (but keep root "/").
  u.pathname = pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

  // Remove tracking params, then sort the rest for a stable string.
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (TRACKING_PARAMS.has(k.toLowerCase())) continue;
    kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);

  const canonical = u.toString();
  const dedupKey = crypto.createHash('sha1').update(canonical).digest('hex');
  return { canonical, hostname: u.hostname, dedupKey };
}

/** Stable content hash for duplicate-page detection. Normalizes whitespace so
 *  trivially different renders of the same page collapse to one hash. */
export function contentHash(body: string): string {
  const normalized = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
