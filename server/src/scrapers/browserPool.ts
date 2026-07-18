/**
 * ============================================================================
 *  SELF-HOSTED BROWSER POOL  —  free replacement for a paid scraping gateway
 * ============================================================================
 *
 *  No Apify subscription. This launches ONE headless Chromium process (using
 *  Playwright's driver against a Chromium binary you already have — see
 *  `resolveExecutablePath` below) and hands out short-lived browser CONTEXTS,
 *  one per scrape. Contexts are cheap; the browser process is the expensive
 *  part, so we keep exactly one alive and reuse it.
 *
 *  Cost: $0. You need a Chromium binary on the machine, which is free:
 *    - `npx playwright install chromium`  (downloads Playwright's own build), OR
 *    - `apt-get install chromium` / `chromium-browser` on the server, OR
 *    - point PLAYWRIGHT_EXECUTABLE_PATH at any existing Chrome/Chromium.
 *
 *  Session identity: each scrape can inject ONE owner's saved session cookie
 *  (from the vault) into the context before navigating, so the request looks
 *  like that teammate's real, logged-in browser — not a bot farm hitting the
 *  target from one shared identity. Rotating across the 30-owner pool spreads
 *  load and reduces the chance any single account gets flagged.
 */

import { chromium, Browser, BrowserContext } from 'playwright-core';
import fs from 'node:fs';

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const IDLE_CLOSE_MS = 5 * 60_000; // release the browser process after 5 min unused

function resolveExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // Sandbox/dev fallback: Playwright's own pre-fetched build, if present.
  const pwDir = '/opt/pw-browsers';
  if (fs.existsSync(pwDir)) {
    const dir = fs.readdirSync(pwDir).find((d) => d.startsWith('chromium-') && !d.includes('headless'));
    if (dir) {
      const p = `${pwDir}/${dir}/chrome-linux/chrome`;
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined; // let Playwright try its default resolution (works if `playwright install` was run)
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = resolveExecutablePath();
    browserPromise = chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

function bumpIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browserPromise) {
      const b = await browserPromise;
      await b.close().catch(() => {});
      browserPromise = null;
    }
  }, IDLE_CLOSE_MS);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Run `fn` inside a fresh, isolated browser context (optionally with a
 * session cookie injected so the request carries one owner's real login).
 * The context is always closed afterward — nothing lingers between scrapes.
 */
export async function withContext<T>(
  fn: (ctx: BrowserContext) => Promise<T>,
  opts?: { cookies?: { name: string; value: string; domain: string; path?: string }[] },
): Promise<T> {
  const browser = await getBrowser();
  bumpIdleTimer();
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  try {
    if (opts?.cookies?.length) {
      await ctx.addCookies(
        opts.cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path ?? '/' })),
      );
    }
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function shutdownBrowserPool() {
  if (idleTimer) clearTimeout(idleTimer);
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
}
