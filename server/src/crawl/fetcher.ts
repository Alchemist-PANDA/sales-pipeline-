/**
 * Browser-rendered fetch with optional proxy.
 *
 * One page fetch: launch/borrow a browser, open an isolated context (optionally
 * behind a proxy and/or carrying an owner session cookie), navigate, and return
 * the rendered HTML + final status. This is the single low-level primitive the
 * crawler orchestrator drives; everything above it (queue, cache, retry, anti-
 * bot) is transport-agnostic.
 *
 * Direct fetches reuse the shared, long-lived browser pool. Proxied fetches
 * (opt-in, comparatively rare) get a dedicated short-lived browser so proxy
 * identity is never accidentally shared with a direct request.
 */

import { chromium, Browser } from 'playwright-core';
import fs from 'node:fs';
import { withContext } from '../scrapers/browserPool.js';
import type { ProxyEndpoint } from './proxyPool.js';

export interface FetchInput {
  url: string;
  platformId: string;
  cookies?: { name: string; value: string; domain: string; path?: string }[];
  proxy?: ProxyEndpoint | null;
  timeoutMs?: number;
  waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';
}

export interface FetchOutcome {
  status: number;
  body: string;
  finalUrl: string;
  headers: Record<string, string>;
  usedProxy?: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.91 Safari/537.36';

const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
];

function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const candidates = [
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const pwDir = '/opt/pw-browsers';
  if (fs.existsSync(pwDir)) {
    const dir = fs.readdirSync(pwDir).find((d) => d.startsWith('chromium') && !d.includes('headless'));
    if (dir) {
      const p = `${pwDir}/${dir}/chrome-linux/chrome`;
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

async function navigate(
  ctxFactory: () => Promise<{ close: () => Promise<void>; newPage: () => Promise<import('playwright-core').Page> }>,
  input: FetchInput,
): Promise<FetchOutcome> {
  const ctx = await ctxFactory();
  try {
    const page = await ctx.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    const response = await page.goto(input.url, {
      waitUntil: input.waitUntil ?? 'domcontentloaded',
      timeout: input.timeoutMs ?? 20_000,
    });
    // Small human-like settle so late DOM/XHR content lands before extraction.
    await page.waitForTimeout(600 + Math.random() * 900);
    const body = await page.content();
    const status = response?.status() ?? 0;
    const headers = response?.headers() ?? {};
    const finalUrl = page.url();
    return { status, body, finalUrl, headers };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function renderFetch(input: FetchInput): Promise<FetchOutcome> {
  // Proxied path: dedicated browser so the proxy identity is isolated.
  if (input.proxy) {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: resolveChromium(),
        args: STEALTH_ARGS,
        proxy: {
          server: input.proxy.server,
          username: input.proxy.username,
          password: input.proxy.password,
        },
      });
      const b = browser;
      const outcome = await navigate(async () => {
        const ctx = await b.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
        if (input.cookies?.length) {
          await ctx.addCookies(input.cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path ?? '/' })));
        }
        return ctx;
      }, input);
      return { ...outcome, usedProxy: input.proxy.url };
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  // Direct path: reuse the shared browser pool via withContext.
  return withContext(async (ctx) => {
    const page = await ctx.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    const response = await page.goto(input.url, {
      waitUntil: input.waitUntil ?? 'domcontentloaded',
      timeout: input.timeoutMs ?? 20_000,
    });
    await page.waitForTimeout(600 + Math.random() * 900);
    const body = await page.content();
    return {
      status: response?.status() ?? 0,
      body,
      finalUrl: page.url(),
      headers: response?.headers() ?? {},
    };
  }, { cookies: input.cookies });
}
