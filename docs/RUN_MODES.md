# Run Modes, Key Safety & Reliability

This system is **safe by default**: nothing spends an API credit until you
explicitly opt into live mode, validate your keys, and stay inside a hard budget.

## Test vs Live

Every room trigger and enrichment run carries a `mode`:

| Mode | Behavior |
|---|---|
| **test** (default) | **Zero external calls.** Discovery produces deterministic, clearly-flagged synthetic candidates; enrichment uses the demo connector. You can exercise the entire pipeline — discovery → selection → enrichment → actionable lead → UI — **without spending a single credit.** |
| **live** | Real calls to real providers, but only ever inside the run budget below. |

Live mode is double-gated: a request may ask for `mode:"live"`, but the server
only honors it when `LIVE_MODE=true` is set. Otherwise the run is **forced to
test** and says so — a stray `mode:"live"` can never spend keys on a box that
was never configured for live traffic.

## Global run budget

Independent of per-provider budgets, one run can never exceed a global ceiling
(`RunContext`): `maxExternalCalls` (default 300) and `maxCostUsd` (default 10).
Every real call reserves against the ceiling *before* it happens; when the
ceiling is reached, remaining work is **skipped and reported**, never silently
over-spent. Cache hits and test-mode synthesis never charge.

Each run returns truthful stats: `realCalls`, `cacheHits`, `synthesized`,
`skippedByBudget`, `failures`, `costUsd`, and a per-provider breakdown.

## Preflight — see the cost before spending

`GET /api/rooms/:room/preflight` reports exactly what a **live** trigger would
do — sources, providers, estimated calls, budget caps, and which required
credentials are connected — **without making any external call.** The UI's
"Preflight" button surfaces this before you ever hit Trigger.

## Cheap credential validation

`POST /api/credentials/validate` checks each connected key against the provider's
**free account/quota endpoint** — never an enrichment call — so validation costs
nothing. Results are cached per credential for 30 minutes, so re-validating is
free too. The UI's "Validate keys" button shows per-provider `ok / failed /
quota remaining`.

## Live connectors

`ApiConnector` performs real HTTP calls for the enrichment waterfall (Hunter,
Prospeo, Anymail Finder, FindyMail, Apollo, …) with timeout, retry, and circuit
breaking, decrypting the pooled account's key. **In live mode it returns real
data or nothing** — it never fabricates. Synthetic data comes only from the demo
connector in test mode. Providers without an implemented adapter simply
contribute nothing to a live run (the waterfall moves on), rather than faking a
result.

## Recommended flow when you add credentials

1. Enter keys (Master Key Console / per-provider).
2. Set `LIVE_MODE=true` and restart.
3. **Validate keys** — confirm each provider is `ok` (free, no credits).
4. Switch the toggle to **Live**, open a room, hit **Preflight** to see the cost.
5. **Trigger.** Watch the run stats: `realCalls` stays within budget, failures
   are visible, nothing is hidden.
