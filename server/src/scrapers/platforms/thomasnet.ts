import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function thomasnetScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'thomasnet',
    url: `https://www.thomasnet.com/nsearch.html?cov=NA&heading=&what=${encodeURIComponent(company)}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const results = await page.$$eval(
        '.supplier-result, [class*="company-card"]',
        (els) =>
          els.slice(0, 3).map((el) => ({
            name: el.querySelector('h2, .profile-card__title')?.textContent?.trim() ?? '',
            location: el.querySelector('[class*="location"], .profile-card__location')?.textContent?.trim() ?? '',
            desc: el.querySelector('[class*="description"], p')?.textContent?.trim() ?? '',
          })),
      ).catch(() => []);

      for (const r of results) {
        if (r.name) {
          evidence.push(`ThomasNet listing: ${r.name} — ${r.desc?.slice(0, 100)}`);
          if (r.location) evidence.push(`Local business listing found; ${r.location}`);
        }
      }

      return { evidence };
    },
  };
}
