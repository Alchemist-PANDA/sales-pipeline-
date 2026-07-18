# Architecture

Alchemist Signal Forge is a two-process system: a TypeScript/Express API over
SQLite, and a React/Vite dashboard. In production the API serves the built
dashboard, so it deploys as a single artifact.

## The three problems it solves

| Problem | Mechanism | Where |
|---|---|---|
| One account's quota is tiny | **Account-pool rotation** across 30 owners | `core/pool.ts` |
| 900 credentials are miserable to enter | **4 zero-friction onboarding paths** | `services/credentials.ts` |
| Finding signals by hand doesn't scale | **Autonomous waterfall + 60-signal scoring** | `services/enrich.ts` |

## Data model (SQLite)

```
owners ──1:N── accounts        (one account per platform per owner)
  │                │
  │                └── secret_sealed  (AES-256-GCM blob; never leaves server)
  │
leads ──1:N── lead_signals     (detected signals + evidence per lead)
  │
  └──1:N── enrichment_runs     (every provider call, attributed to an owner)
```

- **owners.status** = `active` (15 live) | `reserved` (15 held). The pool only
  ever leases from active owners; flipping status is the "activate" action.
- **accounts** carry live quota accounting (`quota_used`/`quota_limit`,
  `quota_reset_at`), `health` (0-100), and `cooldown_until` for rate-limit
  benching.

## The pool router (the throughput "magic")

`AccountPool.lease(platformId)` runs this selection every call:

1. roll over any account whose monthly quota window expired,
2. filter to **active-owner, connected, quota-remaining, not-cooling-down**
   accounts for that platform,
3. order by **least-recently-used, then health** → even round-robin spread,
4. optimistically stamp `last_used_at` so concurrent leases diverge.

`release(ok, {rateLimited})` then either credits usage + nudges health up,
benches the account 15 min on a rate-limit, or dents health on a soft failure.
When a platform's whole pool is exhausted, `lease` returns `null` and the
orchestrator waterfalls to the next provider — callers never see the failover.

## The enrichment orchestrator

`EnrichmentEngine.enrichLead(lead)`:

1. **Contact waterfall** — iterate `WATERFALL_ORDER` (cheapest-accurate first),
   each call pooled, merging fields and **short-circuiting on a verified email**.
2. **Signal sweep** — call every signal-source platform (pooled) and collect
   free-text evidence.
3. **Detect** — match evidence against the 60-signal keyword rules.
4. **Score & route** — data-quality base + capped signal strength → 0-100 fit;
   GEO vs AR from which product's signals dominate.

`persist()` writes fields + signals back and flips the lead to `qualified` at 60+.

## Self-hosted scraping (Crawlee engine)

Non-API platforms (LinkedIn, Glassdoor, YC, Wellfound, Capterra, TrustRadius,
Clutch, ThomasNet, Manta, Google Business) are scraped via a **self-hosted
Crawlee + Playwright** engine — $0 cost, no Apify subscription needed.

- `scrapers/engine.ts` — Crawlee PlaywrightCrawler with stealth args, session
  pool, fingerprint rotation, and automatic retries.
- `scrapers/rateLimiter.ts` — per-platform jittered delays + concurrency caps
  (LinkedIn 4s, Glassdoor 3s, etc.) to avoid IP bans.
- `scrapers/platforms/*.ts` — platform-specific extraction logic (URL templates
  + page selectors).
- `connectors/scraper.ts` — `ScraperConnector` that plugs into the same
  connector framework as API platforms. Decrypts session cookies from the vault
  and injects them into the browser context for authenticated scraping.

The engine rotates across the 30-owner cookie pool just like API connectors —
each scrape runs in an isolated browser context with one owner's session.

## Demo vs live

Connectors run in **demo mode** by default: deterministic synthetic responses
seeded off the company name, worded to match the signal rules — so the whole
pipeline is demonstrable with zero API keys. Setting `LIVE_MODE=true` switches
scraper-backed platforms to real Crawlee extraction and API-backed platforms
to real HTTP calls — without touching the pool, scoring, or UI.

## Security

- Credentials sealed with AES-256-GCM (`core/vault.ts`), per-record random IV.
- `VAULT_KEY` (≥32 chars) required in production; dev uses a deterministic
  fallback with a loud warning.
- The API returns only a masked preview (`••••••f3a9`) + a connected flag —
  never plaintext secrets.
- Every credential and owner action is written to `audit_log`.
