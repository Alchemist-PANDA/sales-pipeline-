# Integrations

Every platform is declared once in [`server/src/core/registry.ts`](../server/src/core/registry.ts).
That single declaration drives the onboarding UI, the vault, the pool router,
and connection testing — so adding a platform is a data change, not a code
change.

## The four fast-connect paths

Ordered by least friction. The registry's `onboarding` field picks the default
per platform.

1. **Gateway auto-connect** (`gateway_autoconnect`) — one gateway token unlocks
   every platform that declares that gateway, credential-free. **Apify** is
   wired as a live MCP gateway fronting the YC directory, Google Maps,
   exhibitor lists, review sites, Glassdoor, and more.
2. **Magic link** (`magic_link`) — `POST /api/credentials/invites` mints one
   `/connect/:token` link per teammate. They open it on a phone, paste their own
   keys (~5s each), and their accounts join the pool. The admin never handles
   the 900 secrets.
3. **Bulk paste** (`paste_key` at scale) — `POST /api/credentials/bulk` takes a
   textarea of one key per line, or `email,key` rows, and provisions every owner
   for a platform in one call, live-testing each.
4. **Quick connect** (`paste_key`) — `POST /api/credentials/connect` for a
   single account, sealed + verified inline.

## Auth types

| `authType` | Meaning | Example platforms |
|---|---|---|
| `mcp_gateway` | fronted by an MCP gateway, zero-touch | Apify |
| `api_key` | paste one key/token, auto-verified | Apollo, Hunter, Prospeo, Snov, Lusha, Wappalyzer, BuiltWith, Crunchbase, Yelp… |
| `oauth2` | one-click consent | Product Hunt, Google Business Profile |
| `cookie` | guided session capture (scrapers) | LinkedIn, Wellfound, Capterra, Glassdoor… |
| `public` | no auth | Y Combinator, OpenVC, SEC EDGAR, USPTO |

## Platform coverage (36)

- **Lead-gen B2B databases** — Apollo, Lusha, ContactOut, Snov.io, Skrapp,
  Prospeo, GetProspect, Kaspr
- **Domain & verification** — Hunter, Anymail Finder, FindyMail, FindThatLead
- **Startups data** — Product Hunt, Wellfound, OpenVC, Y Combinator, G2,
  Capterra, TrustRadius, Clutch
- **Technology** — Wappalyzer, BuiltWith
- **Local signals** — Google Business Profile, Yelp, Foursquare, ThomasNet, Manta
- **Enrichment & signals** — Clay, LinkedIn, Crunchbase, SEC EDGAR, USPTO,
  Glassdoor, SimilarWeb, RB2B/Warmly
- **Gateway** — Apify (MCP)

## Adding a platform

1. Append a `Platform` object to `PLATFORMS` in `registry.ts` (id, name,
   category, `authType`, `onboarding`, `fields`, quota, cost, `provides`).
2. That's it for demo mode — the generic connector specializes off `provides`.
3. For live data, add a real branch in `connectors/` keyed by the platform id;
   the pool, vault, scoring, and UI need no changes.

## The email waterfall

Platforms with `enrichment: true` and a `waterfallRank` form the contact
waterfall, tried cheapest-accurate-first and short-circuiting on a verified
email:

```
Prospeo → Hunter → Snov → Skrapp → Anymail/Lusha → FindyMail → … 
```

Tune the order by editing each platform's `waterfallRank` and `costWeight`.
