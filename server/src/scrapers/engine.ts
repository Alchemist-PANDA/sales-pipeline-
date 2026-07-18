/**
 * Crawlee-powered scraping engine. Uses PlaywrightCrawler with stealth plugins
 * for bot-detection bypass. Self-hosted, $0 cost, rotates across the 30-owner
 * session pool to spread load and avoid bans.
 *
 * Each platform declares a ScrapeTask — URL template + extraction logic.
 * The engine handles launching, stealth, retries, and rate limiting.
 */

import { PlaywrightCrawler, Dataset, Configuration } from 'crawlee';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { throttled } from './rateLimiter.js';

export interface ScrapeTask {
  platformId: string;
  url: string;
  cookies?: { name: string; value: string; domain: string; path?: string }[];
  extract: (page: import('playwright-core').Page) => Promise<ScrapeResult>;
}

export interface ScrapeResult {
  evidence: string[];
  structured?: Record<string, unknown>;
  rateLimited?: boolean;
}

function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const candidates = [
    '/opt/pw-browsers/chromium-1161/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const pwDir = '/opt/pw-browsers';
  if (fs.existsSync(pwDir)) {
    const dir = fs.readdirSync(pwDir).find((d) => d.startsWith('chromium'));
    if (dir) {
      const p = `${pwDir}/${dir}/chrome-linux/chrome`;
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.91 Safari/537.36';

/**
 * Run a single scrape task through the Crawlee engine with stealth, rate
 * limiting, and automatic retries. Returns extracted evidence strings.
 */
export async function runScrape(task: ScrapeTask): Promise<ScrapeResult> {
  return throttled(task.platformId, async () => {
    const executablePath = resolveChromium();
    let result: ScrapeResult = { evidence: [] };

    const crawler = new PlaywrightCrawler({
      launchContext: {
        launcher: chromium,
        launchOptions: {
          headless: true,
          executablePath,
          args: STEALTH_ARGS,
        },
      },
      browserPoolOptions: {
        maxOpenPagesPerBrowser: 1,
        retireBrowserAfterPageCount: 1,
        useFingerprints: true,
      },
      maxRequestRetries: 2,
      requestHandlerTimeoutSecs: 30,
      maxConcurrency: 1,
      useSessionPool: true,
      persistCookiesPerSession: true,

      async requestHandler({ page, request }) {
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        if (task.cookies?.length) {
          await page.context().addCookies(
            task.cookies.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path ?? '/',
            })),
          );
        }

        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(800 + Math.random() * 1200);

        result = await task.extract(page);
      },

      failedRequestHandler({ request }) {
        result = { evidence: [], rateLimited: true };
      },
    }, new Configuration({ persistStorage: false }));

    await crawler.run([{ url: task.url, uniqueKey: `${task.platformId}-${Date.now()}` }]);

    return result;
  });
}

/**
 * Batch multiple scrape tasks — runs them sequentially with per-platform
 * rate limiting (the throttled() wrapper handles inter-request delays).
 */
export async function runScrapeBatch(tasks: ScrapeTask[]): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  for (const task of tasks) {
    results.push(await runScrape(task));
  }
  return results;
}
