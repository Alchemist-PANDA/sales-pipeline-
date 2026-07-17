/**
 * ============================================================================
 *  SIGNAL CATALOG  —  the 60 verified buying signals
 * ============================================================================
 *
 *  Part A = the 30 signals from the Sales Alchemist Playbook.
 *  Part B = the 30 additional verified signals from the Signal Reference Guide.
 *
 *  Each entry is a machine-scoreable rule the enrichment engine evaluates
 *  against an enriched lead. `weight` feeds the 0-100 fit score; `product`
 *  routes the signal to the right pitch (GEO vs AR); `platforms` are the
 *  registry ids that can *catch* the signal.
 */

export type Product = 'GEO' | 'AR' | 'BOTH';

export interface SignalDef {
  code: string; // stable id, e.g. "A01"
  part: 'A' | 'B';
  title: string;
  category: string; // human category from the guide
  product: Product;
  weight: number; // contribution to fit score when detected (0-15)
  platforms: string[]; // registry ids that source this signal
  /** Keywords the detector matches against enrichment text/roles. */
  match?: string[];
}

export const SIGNALS: SignalDef[] = [
  // ── Part A — from the playbook ───────────────────────────────────────────
  { code: 'A01', part: 'A', title: 'Job postings / hiring surge', category: 'Hiring', product: 'BOTH', weight: 8, platforms: ['linkedin', 'apollo'], match: ['hiring', 'now hiring', 'open role'] },
  { code: 'A02', part: 'A', title: '"AR Specialist" job posting', category: 'Hiring — AR', product: 'AR', weight: 12, platforms: ['linkedin', 'apollo'], match: ['ar specialist', 'accounts receivable'] },
  { code: 'A03', part: 'A', title: '"Collections" job posting', category: 'Hiring — AR', product: 'AR', weight: 12, platforms: ['linkedin', 'apollo'], match: ['collections'] },
  { code: 'A04', part: 'A', title: '"Billing Coordinator" job posting', category: 'Hiring — AR', product: 'AR', weight: 11, platforms: ['linkedin', 'apollo'], match: ['billing coordinator', 'billing specialist'] },
  { code: 'A05', part: 'A', title: '"Controller" job posting', category: 'Hiring — AR', product: 'AR', weight: 10, platforms: ['linkedin', 'apollo'], match: ['controller'] },
  { code: 'A06', part: 'A', title: '"Content Marketing Manager" posting', category: 'Hiring — GEO', product: 'GEO', weight: 11, platforms: ['linkedin', 'apollo'], match: ['content marketing', 'content manager'] },
  { code: 'A07', part: 'A', title: '"SEO Specialist" job posting', category: 'Hiring — GEO', product: 'GEO', weight: 12, platforms: ['linkedin', 'apollo'], match: ['seo specialist', 'seo manager'] },
  { code: 'A08', part: 'A', title: '"Growth Marketer" job posting', category: 'Hiring — GEO', product: 'GEO', weight: 10, platforms: ['linkedin', 'apollo'], match: ['growth marketer', 'growth marketing'] },
  { code: 'A09', part: 'A', title: '"Head of Brand" job posting', category: 'Hiring — GEO', product: 'GEO', weight: 10, platforms: ['linkedin', 'apollo'], match: ['head of brand', 'brand director'] },
  { code: 'A10', part: 'A', title: '3+ related roles posted together', category: 'Hiring cluster', product: 'BOTH', weight: 13, platforms: ['linkedin', 'apollo'], match: ['cluster'] },
  { code: 'A11', part: 'A', title: 'First-time VP/C-level hire in target function', category: 'Leadership change', product: 'BOTH', weight: 12, platforms: ['linkedin', 'apollo'], match: ['vp', 'chief', 'head of'] },
  { code: 'A12', part: 'A', title: 'Recency-filtered posting (≤7 days)', category: 'Hiring hygiene', product: 'BOTH', weight: 6, platforms: ['linkedin'], match: ['recent'] },
  { code: 'A13', part: 'A', title: 'New leadership hire (general)', category: 'Leadership change', product: 'BOTH', weight: 9, platforms: ['linkedin', 'apollo'], match: ['new in role', 'promoted', 'appointed'] },
  { code: 'A14', part: 'A', title: 'Profile update showing leadership change', category: 'Leadership change', product: 'BOTH', weight: 8, platforms: ['linkedin'], match: ['profile update'] },
  { code: 'A15', part: 'A', title: 'Funding announcement', category: 'Company event', product: 'BOTH', weight: 11, platforms: ['crunchbase', 'openvc', 'ycombinator'], match: ['raised', 'seed', 'series a', 'series b', 'funding'] },
  { code: 'A16', part: 'A', title: 'Recent product launch', category: 'Company event', product: 'GEO', weight: 9, platforms: ['producthunt', 'linkedin'], match: ['launch', 'launched', 'new product'] },
  { code: 'A17', part: 'A', title: 'YC batch release (new cohort)', category: 'Company event', product: 'GEO', weight: 8, platforms: ['ycombinator'], match: ['yc batch', 'y combinator'] },
  { code: 'A18', part: 'A', title: 'YC 18–36 mo post-batch, 20+ employees', category: 'Timing filter', product: 'GEO', weight: 12, platforms: ['ycombinator'], match: ['post-batch'] },
  { code: 'A19', part: 'A', title: '"isHiring" flag in YC directory', category: 'Hiring / budget proxy', product: 'GEO', weight: 9, platforms: ['ycombinator'], match: ['ishiring'] },
  { code: 'A20', part: 'A', title: 'Still using spreadsheets for AR', category: 'Tech-stack gap', product: 'AR', weight: 13, platforms: ['clay', 'builtwith'], match: ['spreadsheet', 'excel', 'manual invoic'] },
  { code: 'A21', part: 'A', title: 'Zero structured schema / entity presence', category: 'Tech-stack gap', product: 'GEO', weight: 12, platforms: ['builtwith', 'wappalyzer'], match: ['no schema', 'missing structured data'] },
  { code: 'A22', part: 'A', title: 'Invoicing tool but no cash visibility', category: 'Tech-stack gap', product: 'AR', weight: 11, platforms: ['builtwith', 'clay'], match: ['quickbooks', 'xero', 'bill.com'] },
  { code: 'A23', part: 'A', title: 'Careers-page tech-stack clues', category: 'Tech-stack gap', product: 'BOTH', weight: 7, platforms: ['clay', 'wappalyzer'], match: ['careers'] },
  { code: 'A24', part: 'A', title: 'Public complaints about late payments', category: 'Public content', product: 'AR', weight: 10, platforms: ['linkedin'], match: ['late payment', 'overdue', 'not paid'] },
  { code: 'A25', part: 'A', title: 'Complaints ChatGPT/Perplexity ignores brand', category: 'Public content', product: 'GEO', weight: 10, platforms: ['linkedin'], match: ['chatgpt', 'perplexity', 'not cited'] },
  { code: 'A26', part: 'A', title: 'Founder/finance Twitter pain chatter', category: 'Public content', product: 'BOTH', weight: 6, platforms: ['linkedin'], match: ['cash flow', 'runway'] },
  { code: 'A27', part: 'A', title: 'Freelance job posted on Upwork', category: 'Marketplace intent', product: 'BOTH', weight: 8, platforms: ['apify'], match: ['upwork', 'freelance'] },
  { code: 'A28', part: 'A', title: 'Local business with no GEO presence', category: 'Geographic gap', product: 'GEO', weight: 9, platforms: ['google_business', 'yelp', 'foursquare'], match: ['no website', 'local'] },
  { code: 'A29', part: 'A', title: 'SEO budget + traffic-erosion anxiety', category: 'ICP / buyer', product: 'GEO', weight: 8, platforms: ['similarweb'], match: ['traffic decline', 'seo budget'] },
  { code: 'A30', part: 'A', title: 'Buyers research in ChatGPT pre-vendor', category: 'ICP / buyer', product: 'GEO', weight: 7, platforms: ['clay'], match: ['fintech', 'healthcare', 'professional services'] },

  // ── Part B — additional verified signals ─────────────────────────────────
  { code: 'B01', part: 'B', title: 'Frequent discount / flash-sale promos', category: 'Financial distress', product: 'AR', weight: 9, platforms: ['apify'], match: ['flash sale', 'discount', 'promo'] },
  { code: 'B02', part: 'B', title: 'Extended payment terms to vendors', category: 'Financial distress', product: 'AR', weight: 11, platforms: ['sec_edgar', 'crunchbase'], match: ['net 60', 'net 90', 'payment terms'] },
  { code: 'B03', part: 'B', title: 'Hiring a fractional / interim CFO', category: 'Financial distress', product: 'AR', weight: 12, platforms: ['linkedin'], match: ['fractional cfo', 'interim cfo'] },
  { code: 'B04', part: 'B', title: 'Vendor complaints surfacing in forums', category: 'Financial distress', product: 'AR', weight: 8, platforms: ['g2', 'apify'], match: ['vendor complaint', 'reddit'] },
  { code: 'B05', part: 'B', title: 'Down-round or bridge financing', category: 'Financial distress', product: 'AR', weight: 11, platforms: ['crunchbase'], match: ['down round', 'bridge round'] },
  { code: 'B06', part: 'B', title: 'Company acquired another business', category: 'M&A', product: 'BOTH', weight: 9, platforms: ['crunchbase', 'sec_edgar'], match: ['acquired', 'acquisition'] },
  { code: 'B07', part: 'B', title: 'Company itself was just acquired', category: 'M&A', product: 'BOTH', weight: 9, platforms: ['crunchbase', 'sec_edgar'], match: ['was acquired', 'merger'] },
  { code: 'B08', part: 'B', title: 'Office expansion / new-market launch', category: 'M&A / structural', product: 'BOTH', weight: 8, platforms: ['linkedin', 'crunchbase'], match: ['expansion', 'new office', 'new market'] },
  { code: 'B09', part: 'B', title: 'ERP / accounting-software migration', category: 'Tech-stack change', product: 'AR', weight: 11, platforms: ['builtwith', 'linkedin'], match: ['erp migration', 'netsuite', 'sap'] },
  { code: 'B10', part: 'B', title: 'Rebrand or domain change', category: 'GEO reset', product: 'GEO', weight: 9, platforms: ['builtwith', 'uspto'], match: ['rebrand', 'domain change'] },
  { code: 'B11', part: 'B', title: 'Visible organic search-traffic decline', category: 'Digital footprint', product: 'GEO', weight: 11, platforms: ['similarweb'], match: ['traffic decline', 'traffic drop'] },
  { code: 'B12', part: 'B', title: 'Competitor just funded or featured', category: 'Competitive', product: 'BOTH', weight: 7, platforms: ['crunchbase'], match: ['competitor funded'] },
  { code: 'B13', part: 'B', title: 'Blog / newsletter cadence drops off', category: 'Digital footprint', product: 'GEO', weight: 7, platforms: ['similarweb'], match: ['cadence drop', 'stopped publishing'] },
  { code: 'B14', part: 'B', title: 'Negative billing reviews on G2/Capterra', category: 'Review intent', product: 'AR', weight: 10, platforms: ['g2', 'capterra', 'trustradius'], match: ['billing complaint', 'invoice issue'] },
  { code: 'B15', part: 'B', title: 'No presence in AI Overviews for brand query', category: 'GEO gap', product: 'GEO', weight: 13, platforms: ['clay'], match: ['not in ai overview', 'no ai citation'] },
  { code: 'B16', part: 'B', title: 'Glassdoor: understaffed finance team', category: 'Attrition', product: 'AR', weight: 10, platforms: ['glassdoor'], match: ['understaffed', 'overworked finance'] },
  { code: 'B17', part: 'B', title: 'Surge of "Open to Work" in finance dept', category: 'Attrition', product: 'AR', weight: 9, platforms: ['linkedin'], match: ['open to work'] },
  { code: 'B18', part: 'B', title: 'Exec post naming the pain directly', category: 'Behavioral', product: 'BOTH', weight: 10, platforms: ['linkedin'], match: ['pain point post'] },
  { code: 'B19', part: 'B', title: 'Exec podcast on scaling pain', category: 'Public content', product: 'BOTH', weight: 6, platforms: ['apify'], match: ['podcast', 'interview'] },
  { code: 'B20', part: 'B', title: 'Sudden internal promotion, no experience', category: 'Attrition', product: 'BOTH', weight: 7, platforms: ['linkedin'], match: ['internal promotion'] },
  { code: 'B21', part: 'B', title: 'Listed as trade-show exhibitor/sponsor', category: 'Event', product: 'BOTH', weight: 8, platforms: ['apify'], match: ['exhibitor', 'sponsor', 'trade show'] },
  { code: 'B22', part: 'B', title: 'RFP / "looking for a vendor" post', category: 'Intent', product: 'BOTH', weight: 12, platforms: ['linkedin', 'apify'], match: ['rfp', 'looking for a vendor', 'seeking vendor'] },
  { code: 'B23', part: 'B', title: 'Patent / trademark filing (new product)', category: 'Event', product: 'GEO', weight: 7, platforms: ['uspto'], match: ['patent', 'trademark'] },
  { code: 'B24', part: 'B', title: 'SEC filing mentions rising DSO', category: 'Public record', product: 'AR', weight: 12, platforms: ['sec_edgar'], match: ['dso', 'days sales outstanding', 'working capital'] },
  { code: 'B25', part: 'B', title: 'Chamber of Commerce new-member listing', category: 'Event', product: 'BOTH', weight: 5, platforms: ['apify'], match: ['chamber of commerce'] },
  { code: 'B26', part: 'B', title: 'Support flooded with billing complaints', category: 'Intent', product: 'AR', weight: 9, platforms: ['g2', 'apify'], match: ['billing complaint', 'support flooded'] },
  { code: 'B27', part: 'B', title: 'Repeat visits to your own website', category: 'First-party intent', product: 'BOTH', weight: 14, platforms: ['rb2b'], match: ['repeat visit', 'website visitor'] },
  { code: 'B28', part: 'B', title: 'Webinar attendance (AR / AI search)', category: 'Intent', product: 'BOTH', weight: 9, platforms: ['linkedin'], match: ['webinar'] },
  { code: 'B29', part: 'B', title: 'Competitor switched to a GEO/AR vendor', category: 'Competitive proof', product: 'BOTH', weight: 8, platforms: ['crunchbase'], match: ['switched vendor'] },
  { code: 'B30', part: 'B', title: 'Same role reposted within 90 days', category: 'Pain persistence', product: 'BOTH', weight: 9, platforms: ['linkedin'], match: ['reposted', 'failed hire'] },
];

export const SIGNALS_BY_CODE: Record<string, SignalDef> = Object.fromEntries(
  SIGNALS.map((s) => [s.code, s]),
);
