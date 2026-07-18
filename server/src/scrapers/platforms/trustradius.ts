import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function trustradiusScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'trustradius',
    url: `https://www.trustradius.com/search?q=${encodeURIComponent(company)}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const results = await page.$$eval(
        '[class*="search-result"], [class*="product-listing"]',
        (els) =>
          els.slice(0, 3).map((el) => ({
            name: el.querySelector('h3, h2, a')?.textContent?.trim() ?? '',
            desc: el.querySelector('p, [class*="snippet"]')?.textContent?.trim() ?? '',
          })),
      ).catch(() => []);

      for (const r of results) {
        if (r.name) evidence.push(`TrustRadius listing: ${r.name} — ${r.desc?.slice(0, 120)}`);
      }

      const reviews = await page.$$eval(
        '[class*="review-snippet"], [class*="review-body"]',
        (els) => els.slice(0, 3).map((el) => el.textContent?.trim().slice(0, 150) ?? ''),
      ).catch(() => []);
      for (const rev of reviews) {
        if (rev) evidence.push(`TrustRadius review: ${rev}`);
      }

      return { evidence };
    },
  };
}
