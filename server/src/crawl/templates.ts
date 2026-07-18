/**
 * Extraction templates.
 *
 * A template turns a fetched page into structured records without bespoke code
 * per site. Each template declares CSS selectors for a repeating "row" and the
 * fields within it, plus optional post-processing. Templates are matched by
 * platform id first, then by hostname pattern, so one registry serves every
 * source and new sites are onboarded by adding a declaration — not a scraper.
 *
 * Parsing uses cheerio (already a dependency) so templates run against raw HTML
 * whether it came from the browser engine or a plain fetch.
 */

import * as cheerio from 'cheerio';

export interface FieldSpec {
  selector?: string;         // relative to the row; omit to use the row node itself
  attr?: string;             // pull an attribute instead of text (e.g. 'href')
  transform?: (raw: string, ctx: { baseUrl: string }) => string;
}

export interface ExtractionTemplate {
  id: string;
  /** Match by platform id (exact) and/or hostname regex. */
  platformIds?: string[];
  hostPattern?: RegExp;
  /** Selector for each repeating result block. */
  rowSelector: string;
  fields: Record<string, FieldSpec>;
  /** Rows missing every field in `requireAny` are dropped. */
  requireAny?: string[];
  limit?: number;
}

export interface ExtractedRow {
  [field: string]: string | undefined;
}

function absolutize(href: string, baseUrl: string): string {
  try { return new URL(href, baseUrl).toString(); } catch { return href; }
}

/** Built-in templates. Directory/review/SERP shapes cover most free sources. */
export const TEMPLATES: ExtractionTemplate[] = [
  {
    id: 'google_serp',
    platformIds: ['google-search', 'google_search', 'google_community_research'],
    hostPattern: /(^|\.)google\./i,
    rowSelector: 'div.MjjYud, div.g',
    fields: {
      title: { selector: 'h3' },
      url: { selector: 'a', attr: 'href', transform: (h, c) => absolutize(h, c.baseUrl) },
      snippet: { selector: '[data-sncf], .VwiC3b, .aCOpRe' },
      displayedDomain: { selector: 'cite' },
    },
    requireAny: ['title', 'url'],
    limit: 20,
  },
  {
    id: 'generic_directory',
    hostPattern: /(clutch\.co|goodfirms\.co|g2\.com|capterra\.|trustradius\.|thomasnet\.|manta\.)/i,
    rowSelector: '[class*="provider"], [class*="listing"], [class*="company"], li.provider-row, article',
    fields: {
      title: { selector: 'h2, h3, [class*="name"] a, [class*="title"]' },
      url: { selector: 'a[href]', attr: 'href', transform: (h, c) => absolutize(h, c.baseUrl) },
      snippet: { selector: 'p, [class*="description"], [class*="tagline"]' },
      location: { selector: '[class*="location"], [class*="locality"]' },
    },
    requireAny: ['title'],
    limit: 40,
  },
  {
    id: 'article_list',
    rowSelector: 'article, li.result, div.result, div.post',
    fields: {
      title: { selector: 'h1, h2, h3, a[class*="title"]' },
      url: { selector: 'a[href]', attr: 'href', transform: (h, c) => absolutize(h, c.baseUrl) },
      snippet: { selector: 'p' },
    },
    requireAny: ['title', 'url'],
    limit: 40,
  },
];

/** Pick the most specific template for a page. */
export function selectTemplate(platformId: string, hostname: string): ExtractionTemplate | null {
  // 1. explicit platform match
  const byPlatform = TEMPLATES.find((t) => t.platformIds?.includes(platformId));
  if (byPlatform) return byPlatform;
  // 2. host pattern match
  const byHost = TEMPLATES.find((t) => t.hostPattern?.test(hostname));
  if (byHost) return byHost;
  return null;
}

/** Run a template against HTML, returning structured rows. */
export function applyTemplate(template: ExtractionTemplate, html: string, baseUrl: string): ExtractedRow[] {
  const $ = cheerio.load(html);
  const out: ExtractedRow[] = [];
  const rows = $(template.rowSelector).toArray();

  for (const node of rows) {
    if (template.limit && out.length >= template.limit) break;
    const row: ExtractedRow = {};
    const $row = $(node);

    for (const [field, spec] of Object.entries(template.fields)) {
      const target = spec.selector ? $row.find(spec.selector).first() : $row;
      if (!target || target.length === 0) continue;
      let value = spec.attr ? (target.attr(spec.attr) ?? '') : target.text();
      value = value.replace(/\s+/g, ' ').trim();
      if (!value) continue;
      if (spec.transform) value = spec.transform(value, { baseUrl });
      row[field] = value;
    }

    const ok = !template.requireAny || template.requireAny.some((f) => row[f]);
    if (ok && Object.keys(row).length) out.push(row);
  }
  return out;
}

/** Convenience: fetch-free extraction directly from HTML for a platform. */
export function extractFromHtml(platformId: string, hostname: string, html: string, baseUrl: string): ExtractedRow[] {
  const template = selectTemplate(platformId, hostname);
  if (!template) return [];
  return applyTemplate(template, html, baseUrl);
}
