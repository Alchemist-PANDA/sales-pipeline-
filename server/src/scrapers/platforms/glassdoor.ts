import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function glassdoorScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'glassdoor',
    url: `https://www.glassdoor.com/Reviews/company-reviews.htm?sc.keyword=${encodeURIComponent(company)}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const reviews = await page.$$eval(
        '[class*="review-text"], [class*="reviewText"], .mt-0',
        (els) => els.slice(0, 5).map((el) => el.textContent?.trim().slice(0, 200) ?? ''),
      ).catch(() => []);

      for (const r of reviews) {
        if (r) evidence.push(`Glassdoor review: ${r}`);
      }

      const rating = await page.$eval(
        '[class*="ratingNum"], [data-test="rating"]',
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');
      if (rating) evidence.push(`Glassdoor rating: ${rating}/5`);

      const overview = await page.$eval(
        '[class*="employer-overview"], [data-test="employerInfo"]',
        (el) => el.textContent?.trim().slice(0, 200) ?? '',
      ).catch(() => '');
      if (overview) evidence.push(`Glassdoor overview: ${overview}`);

      return { evidence };
    },
  };
}
