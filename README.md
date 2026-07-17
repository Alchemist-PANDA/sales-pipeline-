<div align="center">

# ⚗️ Alchemist Signal Forge

### An autonomous B2B **signals-enrichment system** for a 30-owner team

*Turn "mud" (raw company names) into "gold" (scored, signal-qualified, contactable leads) — automatically, at 30× the throughput of a single account.*

Built on **The Sales Alchemist Playbook** + the **60-Signal Reference Guide**.

</div>

---

## Why this exists

Manually hunting buying signals for 100 leads a day is brutal, and a single
Apollo / Hunter / Clay account hits its quota fast. This system solves both:

1. **Pooled throughput.** 30 teammates each bring their own account on every
   platform. Every enrichment call auto-rotates across the pool, so the team
   gets up to **30× the daily quota** without any one account getting
   rate-limited.
2. **Credentials in seconds.** 30 people × ~30 platforms = up to **900
   credentials**. Typing those by hand is exactly the manual work we refuse to
   do. Four zero-friction onboarding paths (below) make it effortless.
3. **Fully autonomous enrichment.** Raw company → waterfall contact enrichment →
   60-signal detection → 0-100 fit scoring → GEO/AR routing — hands-off.

---

## The 30-owner pool (15 live now, 15 reserved)

```
        OWNERS (30)                    PLATFORMS (~36)
  ┌───────────────────┐        ┌──────────────────────────────┐
  │ 15 ACTIVE  ● live │        │ Apollo Hunter Clay Lusha …    │
  │ 15 RESERVED ◐ held│───────▶│ each owner holds 1 account    │
  └───────────────────┘        │ per platform → the POOL       │
            │                   └──────────────┬───────────────┘
            ▼                                  ▼
     AccountPool.lease(platform)  →  picks the healthiest, least-recently-used
     connected account with quota left, respecting cooldowns. On a rate-limit
     it benches that account 15 min and transparently fails over to the next.
```

Reserved owners are **fully wired into the architecture** but held offline.
Flip any of them live with one click on the **Team & Pool** page — their quota
instantly joins the rotation.

---

## Connect credentials in *seconds* (the anti-"manual work" system)

The registry declares, per platform, *how* it authenticates — so the UI renders
the lowest-friction path automatically:

| Path | Friction | How it works |
|---|---|---|
| ⚡ **Gateway auto-connect** | zero-touch | One **Apify MCP** token lights up a dozen scrapers (YC, Google Maps, exhibitor lists…) at once. |
| 🔗 **Magic links** | ~5s each | Admin mints one link per teammate; they open it on their phone, paste their own keys. Admin never touches 900 secrets. |
| 📋 **Bulk paste** | one shot | Paste a whole column of keys (or `email,key` rows) → every owner provisioned + live-tested instantly. |
| 🔑 **Quick connect** | paste-and-go | Single key, auto-verified inline. |

Where a platform offers an **API-key gateway or MCP gateway, we adopt it** instead
of hand-rolling the integration. Apify is wired as a live MCP gateway.

Every credential is sealed with **AES-256-GCM** at rest and never returned by the
API (only a masked preview + a connected flag ever leave the server).

---

## The autonomous enrichment pipeline

```
 raw lead ──▶ 1. CONTACT WATERFALL ──▶ 2. SIGNAL SWEEP ──▶ 3. DETECT ──▶ 4. SCORE & ROUTE
             cheapest provider first,   every signal-source   match 60-      0-100 fit +
             pooled, stop at a verified  platform, pooled      signal rules   GEO vs AR pitch
             email; gaps filled by the
             next provider (Clay-style)
```

- **Waterfall order** is cheapest-accurate-first (Prospeo → Hunter → Snov → …),
  short-circuiting the moment a verified email is found.
- **60 signals** (30 from the playbook + 30 extended) are encoded as scoreable
  rules in [`server/src/core/signals.ts`](server/src/core/signals.ts).
- **Every provider call is attributed** to the owner whose account served it —
  the basis for the team's revenue/lead share.

---

## Dashboard

| Page | What it shows |
|---|---|
| **Overview** | Qualified leads, live owners, pool health, score distribution, GEO/AR split, top firing signals, per-owner contribution, one-click **Run Enrichment Batch**. |
| **Signal Leads** | Every enriched lead with contact data, detected signals + evidence, fit score, route; filter by score; re-run enrichment. |
| **Integrations** | All platforms grouped by category with live/reserved capacity bars + the four fast-connect paths. |
| **Team & Pool** | 15 live + 15 reserved owners, per-owner connected-account depth, activate/reserve toggle. |
| **Signal Catalog** | All 60 signals, filterable by Part (A/B) and product (GEO/AR). |
| **/connect/:token** | The teammate-facing magic-link self-onboarding page. |

---

## Run it

```bash
# 1. Backend  (Node 18+, zero external services — SQLite)
cd server
npm install
npm run seed        # 30 owners (15 live), pooled accounts, 30 raw leads
npm run dev         # API on http://localhost:4000

# 2. Dashboard
cd ../web
npm install
npm run dev         # http://localhost:5173  (proxies /api → 4000)
```

Then click **Run Enrichment Batch** on the Overview.

**Production single-artifact:** `cd web && npm run build` then
`cd ../server && npm run build && npm start` — the API serves the built
dashboard from one process on `:4000`.

### Going live (real APIs)

The system runs in **demo mode** by default (deterministic synthetic provider
responses, so the whole pipeline is demonstrable with zero keys). To go live:

1. Connect real credentials via the Integrations page (any of the 4 paths).
2. Set `LIVE_MODE=true` and a strong `VAULT_KEY` (≥32 chars) in the server env.
3. Implement the real API calls inside each connector in
   [`server/src/connectors/`](server/src/connectors/) — the framework,
   pooling, scoring, and UI are unchanged.

---

## Architecture

```
server/                    Node + TypeScript + Express + SQLite
  src/core/
    registry.ts            ← every platform declared once (auth, gateway, quota)
    signals.ts             ← the 60-signal catalog as scoreable rules
    vault.ts               ← AES-256-GCM credential sealing
    pool.ts                ← the 30-account rotation / failover router
  src/connectors/          ← pluggable per-platform integrations (demo + live)
  src/services/
    enrich.ts              ← waterfall + detection + scoring orchestrator
    credentials.ts         ← the 4 fast-connect paths
  src/routes/api.ts        ← REST API
  src/db/                  ← schema + seed
web/                       React + Vite + Tailwind dashboard
docs/                      ARCHITECTURE.md, INTEGRATIONS.md
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the deep dive and
[`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for the full platform matrix and
how to add a new one.
