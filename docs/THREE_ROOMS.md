# Three-Room Manual Workflow

This system now follows a strict **one-room-at-a-time** operating model.

## Core doctrine

- We are capturing **business signals / leads** to sell:
  - agentic systems
  - SaaS subscriptions
- We are **not** using job platforms to look for 9-5 jobs.
- Job portals are used only to infer business signals such as:
  - hiring spikes
  - finance ops pain
  - collections / AR scaling
  - new departments
  - tech migrations
  - growth / expansion
- Big companies and enterprises are out of scope.
- Ideal customers are always **SMEs**.
- Every signal must include at least one **human-clickable source link**.

---

## Room 1 — Signal Room

Purpose: discover and collect raw signals only.

### Inputs
- active strategy / ICP
- region
- SME filters
- signal definitions
- approved platforms

### Output
A signal inbox where each signal includes:
- company name
- signal title
- snippet / raw evidence
- source platform
- one or more source links
- SME-fit estimate
- relevance status

### Rules
- No enrichment starts here.
- No outreach starts here.
- Every signal must have source links so the operator can open and verify credibility manually.
- Job-board platforms are treated only as signal sources.
- Enterprise / large-company signals are rejected.

---

## Room 2 — Selection + Enrichment Room

Purpose: manually approve which captured signals deserve enrichment.

### Inputs
- signals from Room 1

### Operator action
The human selects the signals to enrich.

### Output
For selected signals only, the system enriches:
- company
- relevant people
- decision-makers
- contact data
- tech stack
- surrounding context

### Rules
- Enrichment is never automatic from Room 1.
- The system must wait for explicit approval.
- Unselected signals remain un-enriched.

---

## Room 3 — Manual Signal Intake Room

Purpose: let the operator manually insert a credible signal with supported evidence.

### Inputs
- manually entered signal
- source links
- description / evidence

### Output
The system treats the manually entered signal as the starting point and then gathers:
- company intelligence
- relevant people
- decision-makers
- contact data
- surrounding context

### Rules
- Manual signal must include supported credible information.
- At least one source link is required.
- Other rooms remain silent while this room is active.

---

## Silent-room behavior

Exactly **one** room may be active at a time.

- If Room 1 is triggered, Room 2 and Room 3 stay silent.
- If Room 2 is triggered, Room 1 and Room 3 stay silent.
- If Room 3 is triggered, Room 1 and Room 2 stay silent.

This is a strict manual operating model.

---

## Recommended UI

### Room 1
- Signal inbox
- filter by platform / region / signal type / SME fit
- open-source-link button
- approve for enrichment
- reject signal

### Room 2
- selected signals queue
- enrichment start button
- enrichment progress
- verified facts with provenance

### Room 3
- manual signal submission form
- company name
- signal type
- description
- source links
- submit for enrichment
