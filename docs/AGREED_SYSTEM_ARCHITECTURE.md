# Agreed Signal-First System Architecture

## System shape

One shared application is used by the 30-person group.

```text
30 users
→ one application
→ one shared room-control layer
→ one signal database
→ separate provider connections and ownership records
```

The commercial flow is:

```text
Strategy
→ signal discovery
→ human review
→ explicit selection
→ enrichment
→ company + decision-makers + verified contact data
→ actionable lead
```

Exactly one room can be active at a time. Every other room remains silent.

## Room 1 — Signal Discovery

Purpose: discover open-world, lead-convertible business events from public evidence.

Typical evidence:

- company websites
- job boards used as business-signal sources
- directories
- review sites
- public records
- news
- public web pages

Room 1 output:

```json
{
  "room": "signal_room",
  "companyNameRaw": "Example Logistics Ltd",
  "title": "Hiring six operations coordinators",
  "signalHypotheses": [
    "manual operations overload",
    "rapid customer growth",
    "workflow automation opportunity"
  ],
  "sourcePlatform": "job_board",
  "sourceLinks": [{
    "label": "Operations hiring post",
    "url": "https://source.example/post",
    "sourceType": "job_board"
  }],
  "smeFit": "yes",
  "status": "candidate"
}
```

## Room 2 — Selection and Enrichment

Purpose: act as the explicit approval gate and enrich only selected signals.

Room 2 performs:

- company resolution
- website and domain discovery
- SME fit checks
- decision-maker discovery
- email discovery
- email verification
- profile and phone enrichment where available
- deduplication
- offer recommendation
- final lead scoring

Room 2 output:

```json
{
  "room": "selection_enrichment_room",
  "originRoom": "signal_room",
  "company": {
    "name": "Example Logistics Ltd",
    "website": "https://examplelogistics.com",
    "industry": "Logistics",
    "employeeRange": "20-50",
    "smeFit": "yes"
  },
  "decisionMakers": [{
    "name": "Jane Smith",
    "role": "Head of Operations",
    "email": "jane@examplelogistics.com",
    "emailStatus": "verified"
  }],
  "recommendedOffer": "Operations automation system",
  "leadScore": 91,
  "status": "ready_for_outreach"
}
```

## Room 3 — Agency Referrals

Purpose: find SME agencies that may need a white-label, referral, overflow-delivery or technical implementation partner.

Primary sources:

- Google referral research
- Clutch
- GoodFirms
- G2
- LinkedIn manual evidence
- Upwork manual evidence
- Google Alerts
- Apollo/Hunter evidence used after selection

Room 3 output:

```json
{
  "room": "referrals_room",
  "agency": "BrightGrowth Agency",
  "title": "Agency hiring four automation specialists",
  "signalHypotheses": [
    "delivery capacity pressure",
    "new client demand",
    "white-label automation opportunity"
  ],
  "relationshipType": "white_label_partner",
  "recommendedOffer": "White-label automation delivery",
  "confidence": 0.84,
  "smeFit": "yes",
  "status": "candidate"
}
```

## Room 4 — Community Monitoring

Purpose: detect business pain, recommendations, outsourcing requests and buying intent in communities.

Primary sources:

- Reddit/PRAW
- authorized Discord channels
- authorized Slack channels
- Google-indexed community research
- X Advanced Search imports
- X Lists imports
- Facebook Group imports
- F5Bot alerts
- n8n webhooks

Room 4 output:

```json
{
  "room": "community_monitoring_room",
  "sourcePlatform": "Reddit",
  "community": "r/smallbusiness",
  "title": "Business owner asks for workflow automation help",
  "rawEvidence": "We are copying orders manually between systems.",
  "signalHypotheses": [
    "manual data transfer",
    "integration pain",
    "automation buying intent"
  ],
  "recommendedOffer": "Order-to-accounting integration",
  "confidence": 0.91,
  "status": "candidate"
}
```

## Room 5 — Manual Signal Intake

Purpose: allow any of the 30 users to submit a credible signal found through a relationship, private message, offline referral or manual research.

Room 5 output:

```json
{
  "room": "manual_signal_room",
  "submittedBy": "Friend 12",
  "companyNameRaw": "Local Dental Group",
  "title": "Needs faster lead follow-up",
  "description": "Web inquiries are often answered the next day.",
  "signalHypotheses": [
    "speed-to-lead failure",
    "lost conversion opportunity",
    "sales automation opportunity"
  ],
  "recommendedOffer": "Speed-to-lead automation",
  "status": "candidate"
}
```

## Agreed account architecture

### Category B

```text
Category B
= exactly one account/integration
= only when the provider explicitly permits the intended heavy-volume collection
```

A Category B source is hard-capped at one live connection and zero standby connections.

### Limited-credit and free-tier providers

Providers such as Apollo, Hunter and similar limited-credit services use this layout:

```text
30 configured connections
├── 15 live
└── 15 standby
```

All 30 connections are managed through the same application. Each connection stores:

- owner ID
- provider
- live/standby/disabled/error status
- quota limit
- quota used
- last successful run
- last error
- consent/configuration status

### Public research sources

Public sources such as Google research, Clutch, GoodFirms and G2 use one conservative shared collector. They are not automatically classified as Category B heavy-volume sources.

### Manual and workspace sources

Manual evidence sources can accept contributions from all 30 users. Slack and Discord connections are represented as separate authorized workspace/server installations inside the same system.

## Global rules

1. Exactly one room is active at a time.
2. Rooms 1, 3, 4 and 5 create candidate signals.
3. Only Room 2 enriches selected signals.
4. Every signal must preserve at least one source URL.
5. The system targets SMEs rather than large enterprises.
6. Job boards are business-signal sources, not job-search workflows.
7. Signal detection is open-world: keywords are seeds, not a closed whitelist.
8. The system is free-first; AI/API, hosting and optional premium providers are the main possible costs.
9. Every successful Room 2 result uses one unified actionable-lead schema.

## Unified final lead

```json
{
  "leadId": "lead-002817",
  "originRoom": "referrals_room",
  "company": {
    "name": "BrightGrowth Agency",
    "website": "https://brightgrowth.example",
    "industry": "Digital Agency",
    "employeeRange": "11-50",
    "smeFit": "yes"
  },
  "signal": {
    "title": "Agency expanding automation delivery capacity",
    "category": "white_label_capacity",
    "summary": "Agency appears to need additional technical delivery support.",
    "confidence": 0.87,
    "sourceLinks": ["https://source.example/profile"]
  },
  "decisionMakers": [{
    "name": "Jane Smith",
    "role": "Founder",
    "email": "jane@brightgrowth.example",
    "emailStatus": "verified"
  }],
  "recommendedOffer": {
    "service": "White-label automation delivery",
    "pain": "Insufficient internal delivery capacity",
    "outreachAngle": "Deliver more projects without immediately expanding permanent headcount."
  },
  "scores": {
    "signalStrength": 87,
    "smeFit": 95,
    "contactability": 90,
    "commercialFit": 92,
    "overall": 91
  },
  "status": "ready_for_outreach"
}
```
