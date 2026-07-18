# Five-Room Signal-First Migration

## Rooms

1. **Signal Discovery** — broad, open-world, source-linked SME signal capture.
2. **Selection + Enrichment** — explicit human approval before enrichment.
3. **Agency Referrals** — free/free-tier agency partnership and overflow sources.
4. **Community Monitoring** — authorized X, Reddit, Discord, Slack, Facebook and Google monitoring.
5. **Manual Signal Intake** — operator-submitted signals with credible evidence links.

Exactly one room may be active. All room execution is manually triggered.

## Free-source policy

Room 3 and Room 4 include only genuinely free or free-tier sources. Trial-only and paid-only tools are excluded.

Partner-owned accounts may be configured for up to 30 partners only when:

- every partner owns and authorizes their own account;
- the platform permits the integration and use case;
- credentials are never shared;
- per-account and organization-level limits are enforced;
- rotation is not used to evade quotas, bans, or platform controls.

High-volume public sources use one shared integration. Manual/community sources remain manual or use approved workspace apps.

## Signal philosophy

Known signal phrases are seed examples, not a closed list. The system captures any credible business event, request, complaint, recommendation request, operational pain, capacity constraint, vendor dissatisfaction, growth pressure, outsourcing need, or referral cue that could become a lead for agentic systems, SaaS, or automation services.

Strict boundaries remain:

- SMEs only;
- no job-seeking interpretation;
- source URLs required;
- strategy relevance required;
- human approval before enrichment;
- one active room at a time.

## API

- `GET /api/rooms/state`
- `POST /api/rooms/activate`
- `POST /api/rooms/idle`
- `GET /api/rooms/sources?room=...`
- `POST /api/rooms/sources/configure`
- `GET /api/rooms/signals?room=...`
- `POST /api/rooms/signals/manual`
- `POST /api/rooms/signals/select`
- `POST /api/rooms/signals/:id/review`
- `POST /api/rooms/signals/:id/reject`
- `POST /api/rooms/:room/run`

## Remaining work

The room control plane, persistence, API surface, free-source registry and dashboard are present. Source-specific collectors still need implementation and validation against each platform's current API terms and access model. Background workers, queues, caching, retries and end-to-end tests should be added before production deployment.
