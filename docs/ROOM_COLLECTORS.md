# Room 3 and Room 4 collectors

This document describes the source-specific collectors used by the manually triggered referrals and community-monitoring rooms.

## Operating rules

- Exactly one room must be active.
- Every captured signal must retain a clickable source URL.
- A saved targeting strategy is required before collectors run.
- Known keywords are seed context, not an exhaustive whitelist. Targeted items with unfamiliar wording are retained as open-world lead candidates.
- The system targets SMEs and sells agentic systems, SaaS and automation services. It is not a job-search workflow.
- Partner-owned API/workspace integrations require the partner's authorization. No account creation, credential sharing or quota-evasion rotation is implemented.

## Live collectors

### Room 3 — Referrals

- `google_search`: executes strategy-generated Google referral and agency-capacity queries.
- `clutch_basic`: uses targeted Google `site:clutch.co` research to discover public directory/profile evidence.
- `goodfirms_basic`: uses targeted Google `site:goodfirms.co` research.
- `g2_basic`: uses targeted Google `site:g2.com` research.

### Room 4 — Community Monitoring

- `google_community_research`: searches indexed public Reddit, X and Facebook-group pages.
- `reddit_api` / `praw`: reads new posts from approved subreddits through Reddit JSON/OAuth endpoints.
- `discord_bot`: reads messages only from channels where an authorized bot is installed.
- `slack_app`: reads history only from channels available to an authorized Slack app.

## Import/webhook collectors

The following sources intentionally use evidence import or an authorized webhook rather than automated private-account scraping:

- X Advanced Search
- X Lists
- Facebook Groups
- LinkedIn manual research
- Upwork saved searches/manual research
- Google Alerts
- F5Bot alerts
- n8n workflows
- Apollo free-tier evidence

Endpoints:

```text
POST /api/rooms/imports/:sourceId
POST /api/rooms/webhooks/:sourceId
```

Example payload:

```json
{
  "room": "community_monitoring_room",
  "strategyId": "strategy-id",
  "items": [
    {
      "title": "Agency owner asks for an automation partner",
      "text": "We need help delivering three new client automations.",
      "url": "https://source.example/post/123",
      "company": "Example Agency",
      "author": "owner-name",
      "publishedAt": "2026-07-18T10:00:00Z"
    }
  ]
}
```

## Running collectors

```text
POST /api/rooms/:room/run
```

Example:

```json
{
  "actor": "admin",
  "strategyId": "strategy-id",
  "sourceIds": ["reddit_api", "discord_bot", "slack_app", "google_community_research"],
  "sourceConfigs": {
    "reddit_api": {
      "subreddits": ["agency", "marketing", "smallbusiness"],
      "maxResults": 25,
      "reddit": {
        "accessToken": "optional-oauth-token",
        "userAgent": "AlchemistSignalForge/1.0"
      }
    },
    "discord_bot": {
      "maxResults": 50,
      "discord": {
        "botToken": "authorized-bot-token",
        "channelIds": ["channel-id"]
      }
    },
    "slack_app": {
      "maxResults": 100,
      "slack": {
        "botToken": "authorized-bot-token",
        "channelIds": ["channel-id"]
      }
    }
  }
}
```

Tokens passed in the run request are used in memory and are not written by the collector service. Production deployment should use a secrets manager and inject short-lived references instead of accepting raw tokens from the browser.

## Output

Collectors write deduplicated `signal_events` containing:

- room origin
- source ID
- source URL/domain
- title and evidence text
- publication/capture timestamps
- flexible signal hypotheses
- rationale
- relevance/confidence
- unverified status for human review

No collector automatically starts enrichment. Room 2 remains the explicit approval gate.
