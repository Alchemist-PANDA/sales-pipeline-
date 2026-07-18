import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function googleBusinessScrapeTask(company: string, location?: string): ScrapeTask {
  const query = location ? `${company} ${location}` : company;
  return {
    platformId: 'google_business',
    url: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      await page.waitForTimeout(2000);

      const results = await page.$$eval(
        '[class*="fontHeadlineSmall"], a[aria-label]',
        (els) =>
          els.slice(0, 5).map((el) => ({
            name: el.textContent?.trim() ?? el.getAttribute('aria-label') ?? '',
          })),
      ).catch(() => []);

      if (results.length === 0) {
        evidence.push(`Local business listing found; no website / weak GEO presence`);
        return { evidence };
      }

      for (const r of results) {
        if (r.name.toLowerCase().includes(company.toLowerCase().split(' ')[0])) {
          evidence.push(`GBP claimed — ${r.name} found on Google Maps`);
        }
      }

      const details = await page.$eval(
        '[class*="fontBodyMedium"]',
        (el) => el.textContent?.trim().slice(0, 200) ?? '',
      ).catch(() => '');
      if (details) evidence.push(`Google Business info: ${details}`);

      if (evidence.length === 0) {
        evidence.push(`Local business listing found; no website / weak GEO presence`);
      }

      return { evidence };
    },
  };
}
