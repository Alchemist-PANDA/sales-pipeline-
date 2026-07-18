import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function clutchScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'clutch',
    url: `https://clutch.co/search?query=${encodeURIComponent(company)}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const listings = await page.$$eval(
        '[class*="provider-row"], [class*="company-item"]',
        (els) =>
          els.slice(0, 3).map((el) => ({
            name: el.querySelector('h3, a[class*="title"]')?.textContent?.trim() ?? '',
            location: el.querySelector('[class*="location"]')?.textContent?.trim() ?? '',
            service: el.querySelector('[class*="service"], [class*="tagline"]')?.textContent?.trim() ?? '',
          })),
      ).catch(() => []);

      for (const l of listings) {
        if (l.name) {
          evidence.push(`Clutch.co listing: ${l.name} — ${l.service?.slice(0, 80)}`);
          if (l.location) evidence.push(`Local business listing found; ${l.location}`);
        }
      }

      return { evidence };
    },
  };
}
