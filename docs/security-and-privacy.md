# Security and privacy model

## Trust boundaries

The browser is untrusted. Session cookies are HttpOnly, SameSite Strict, path-bound, and Secure in production. CSRF tokens are returned to the authenticated application but never persisted by the demo or offline queue. Every write requires both an exact configured Origin and CSRF token. Production rejects non-HTTPS application origins.

The database is the authorization source. Household IDs and roles are never accepted from client payloads. Realm filters are part of every record query. Foreign and missing records are indistinguishable.

Guest credentials are 256-bit random opaque values. Only SHA-256 digests are stored. Grants are realm-bound, closed-action scoped, expiring, revocable, and owner-created. Expiry is exclusive: access is denied when server time equals `expiresAt`.

## Input, output, and resources

- Zod schemas bound public strings, arrays, UUIDs, versions, and datetimes.
- Fastify limits bodies to 32 KiB.
- Login attempts are rate-limited and return generic errors.
- SQLite statements use parameters; transactions pair mutations with replay receipts.
- Errors are sanitized; defensive headers deny framing, objects, sensors, payments, and cross-origin openers.
- There is no arbitrary URL fetch, proxy, file read, command execution, upload, template expression, or provider callback surface.

## Browser storage

The anonymous demo uses only `household-coordinator:synthetic-demo:v1`. It contains deterministic fictional labels and has no route into account realms. The offline queue stores mutation bodies and statuses, never passwords, session cookies, CSRF values, or guest opaque credentials. Integrators must retain guest expiry/revocation metadata without persisting the raw grant credential.

## Data lifecycle

This MVP is self-hosted only. Operators own backup, filesystem permissions, retention, and deletion. The app has no telemetry, advertising, analytics, external OAuth, retailer, messaging, AI, camera, location, finance, medical decision, emergency, or smart-home control integration.

## Public-release controls

`tools/scan-public.mjs` scans current source and reachable blobs for private absolute paths, non-fixture email identifiers, secret assignments, private-key markers, and provider-token shapes without printing candidate values. Canary tests prove the detectors fire. Release requires zero unexplained findings, zero high/critical npm audit findings, clean exact-tree export, independent exact-byte review, hosted exact-SHA CI, zero open high/critical Dependabot alerts, and zero open secret-scanning alerts.

## Threat review highlights

- IDOR/cross-realm: realm predicates plus negative tests.
- Session theft: HttpOnly, SameSite, Secure production cookie and short lifetime.
- CSRF: exact Origin allowlist plus per-session token.
- Credential stuffing: bounded login attempts and generic errors.
- Replay/duplicate offline writes: UUID idempotency receipt and transaction.
- Lost update: optimistic version check and explicit conflict state.
- Guest access after authority loss: synchronous expiry/revocation check before query; client queue blocks before transport.
- XSS: React text rendering, strict CSP, no user HTML.
- SSRF/RCE/traversal: no corresponding product surface.
