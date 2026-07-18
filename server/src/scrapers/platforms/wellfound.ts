import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function wellfoundScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    platformId: 'wellfound',
    url: `https://wellfound.com/company/${slug}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const funding = await page.$eval(
        '[class*="funding"], [data-test="raised"]',
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');
      if (funding) evidence.push(`Wellfound funding: ${funding}`);

      const stage = await page.$eval(
        '[class*="stage"], [data-test="stage"]',
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');
      if (stage) evidence.push(`Startup stage: ${stage}`);

      const jobs = await page.$$eval(
        '[class*="job-listing"] h2, [class*="listing-title"]',
        (els) => els.slice(0, 5).map((el) => el.textContent?.trim() ?? ''),
      ).catch(() => []);
      for (const j of jobs) {
        if (j) evidence.push(`Hiring on Wellfound: ${j}`);
      }

      const overview = await page.$eval(
        '[class*="company-summary"], [class*="overview"] p',
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');
      if (overview) evidence.push(`Wellfound overview: ${overview.slice(0, 150)}`);

      return { evidence };
    },
  };
}
