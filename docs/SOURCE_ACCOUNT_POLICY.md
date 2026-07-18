# Source account policy

This policy is enforced by `server/src/core/freeRoomSources.ts` for Room 3 and Room 4.

## Category B: one-account bulk source

A source may be placed in Category B only when the provider explicitly permits the intended high-volume collection through one account or integration.

Hardcoded invariants:

- access model: `category_b_single_bulk_account`
- `bulkSingleAccountPermitted: true`
- `maxPartnerAccounts: 1`
- runtime validation rejects any Category B definition or request that violates those values

No source should be promoted to Category B merely because scraping is technically possible. Written provider terms, an official API entitlement, or explicit provider approval should support the classification.

## Non-bulk account sources

A platform that does not permit the Category B model may use multiple connections only when every connection:

- has a distinct real owner
- is explicitly authorized by that owner
- is permitted by the platform for the intended workflow
- observes its own rate and credit limits
- is not rotated, pooled or coordinated to bypass platform or organization limits

The system supports up to 30 independently authorized connections for eligible sources. The number 30 is a system capacity limit, not permission to create duplicate accounts or multiply one user's quota.

## Public research sources

Sources such as public search and directory research use `single_public_research`. They have one shared collector, conservative limits, caching and backoff. They are not automatically classified as heavy-bulk sources.

## Manual sources

LinkedIn, X, Facebook Groups and similar private-account surfaces remain manual evidence-intake sources. Contributors use accounts they legitimately own and may access. The system does not automate login, share credentials or rotate sessions.

## Authorized workspace applications

Slack and Discord connections are scoped to workspaces, servers and channels where the application or bot is explicitly installed and authorized.

## Current Category B allowlist

The current allowlist is intentionally empty. A source must be deliberately changed in the registry after its one-account high-volume permission has been verified. This fail-closed behavior prevents an unverified source from silently becoming a bulk collector.
