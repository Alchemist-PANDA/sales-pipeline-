/**
 * Anti-bot failure detection.
 *
 * A 200 OK does not mean success — many targets serve a challenge/block page
 * with a 200 status. We inspect the response body (and status) for the tell-
 * tale signatures of CAPTCHAs, WAF interstitials and rate-limit walls so the
 * crawler can react (rotate proxy + session, back off) instead of happily
 * extracting garbage from a "please verify you are human" page.
 */

import type { ErrorClass } from './retry.js';

export interface AntiBotVerdict {
  blocked: boolean;
  kind?: string;         // cloudflare|recaptcha|hcaptcha|datadome|perimeterx|px|rate_wall|login_wall|empty
  errorClass?: ErrorClass;
}

/** Signatures that, if present in the body, indicate a bot wall rather than content. */
const SIGNATURES: { kind: string; test: RegExp }[] = [
  { kind: 'cloudflare', test: /cf-browser-verification|checking your browser before accessing|cf-challenge|__cf_chl/i },
  { kind: 'recaptcha', test: /g-recaptcha|recaptcha\/api\.js|www\.google\.com\/recaptcha/i },
  { kind: 'hcaptcha', test: /hcaptcha\.com\/1\/api\.js|h-captcha/i },
  { kind: 'datadome', test: /datadome|dd_cookie|geo\.captcha-delivery\.com/i },
  { kind: 'perimeterx', test: /perimeterx|_px[0-9A-Za-z]*|px-captcha|human challenge/i },
  { kind: 'akamai', test: /ak_bmsc|akamai.*bot.*manager|reference #\d+\.\w+/i },
  { kind: 'rate_wall', test: /too many requests|rate limited|unusual traffic|automated queries/i },
  { kind: 'login_wall', test: /please (log ?in|sign ?in) to continue|authwall|/i },
];

// login_wall is broad; only trip it when a login prompt dominates a short body.
const LOGIN_WALL = /(sign in|log in|authwall|join to view|members? only)/i;

/**
 * Decide whether a fetched page is a bot wall.
 *
 * @param status  HTTP status code
 * @param body    response body (HTML/text)
 */
export function detectBlock(status: number, body: string): AntiBotVerdict {
  if (status === 403 || status === 429) {
    return { blocked: true, kind: status === 429 ? 'rate_wall' : 'blocked', errorClass: status === 429 ? 'rate_limited' : 'blocked' };
  }
  if (status === 503 && /cloudflare/i.test(body)) {
    return { blocked: true, kind: 'cloudflare', errorClass: 'blocked' };
  }

  const sample = body.slice(0, 20_000);
  for (const sig of SIGNATURES) {
    if (sig.kind === 'login_wall') continue; // handled below with size heuristic
    if (sig.test.test(sample)) {
      return {
        blocked: true,
        kind: sig.kind,
        errorClass: sig.kind === 'rate_wall' ? 'rate_limited' : 'blocked',
      };
    }
  }

  // A suspiciously tiny body on a 200 is often an interstitial.
  const textLen = sample.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
  if (status === 200 && textLen < 120 && LOGIN_WALL.test(sample)) {
    return { blocked: true, kind: 'login_wall', errorClass: 'blocked' };
  }
  if (status === 200 && textLen === 0) {
    return { blocked: true, kind: 'empty', errorClass: 'blocked' };
  }

  return { blocked: false };
}
