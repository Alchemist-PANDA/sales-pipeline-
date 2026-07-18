import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function mantaScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'manta',
    url: `https://www.manta.com/search?search=${encodeURIComponent(company)}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const listings = await page.$$eval(
        '[class*="search-result"], .business-listing',
        (els) =>
          els.slice(0, 3).map((el) => ({
            name: el.querySelector('h2, a[class*="name"]')?.textContent?.trim() ?? '',
            address: el.querySelector('[class*="address"], .address')?.textContent?.trim() ?? '',
            category: el.querySelector('[class*="category"]')?.textContent?.trim() ?? '',
          })),
      ).catch(() => []);

      for (const l of listings) {
        if (l.name) {
          evidence.push(`Manta listing: ${l.name} — ${l.category}`);
          if (l.address) evidence.push(`Local business listing found; ${l.address}`);
        }
      }

      return { evidence };
    },
  };
}
