# Architecture

## Runtime shape

```text
Browser PWA
  ├─ deterministic demo store (browser-only, no fetch)
  ├─ authenticated API client (same origin)
  └─ offline mutation queue (stable UUID idempotency keys)
          │ HTTPS, SameSite session, Origin + CSRF
          ▼
Fastify API
  ├─ authentication / session lookup
  ├─ realm + role + guest-scope authorization
  ├─ validation / optimistic concurrency / idempotency
  └─ SQLite transactions and constraints
```

## Ownership boundaries

- `src/client/`: React UI, demo storage, and the transport-independent offline queue.
- `src/server/app.ts`: app factory, schema initialization, authentication, authorization, and bounded routes.
- `src/server/index.ts`: validated runtime configuration, static serving, listening, and graceful shutdown.
- `tests/api/`: API, authorization, idempotency, conflict, and security contract tests.
- `tests/client/`: deterministic demo, offline queue, DOM, and Axe tests.
- `tests/e2e/`: exact built PWA browser acceptance.
- `tools/scan-public.mjs`: current-tree and reachable-history privacy/secret scanner.

## Data and authority

Every user belongs to exactly one household. Every mutable household record carries `household_id`; every query supplies the authenticated or guest grant household ID. A lookup outside that realm returns the same not-found shape as an unknown ID.

Owner/member authority is evaluated server-side. Guest authority is derived only from a hashed opaque credential's realm, action allowlist, expiry, and revocation state. Client labels never confer authority.

## Concurrency

Mutable records carry a positive integer version. Writes include `expectedVersion`; stale writes receive HTTP 409 with the current version and do not mutate state. Every replayable mutation has a UUID idempotency key. The original successful response is stored in the same transaction as the mutation where the endpoint participates in offline replay.

## Offline

The service worker caches same-origin GET shell assets only and explicitly ignores `/api/`. Authorized labelled data may be cached by the installed client after first sync; credentials are not stored in browser storage. Mutations remain visibly pending, use stable idempotency keys, and transition to conflict or blocked states without silent overwrites. Guest queue entries are inspected before transport and never sent at or after expiry or after revocation is known.

## Home Assistant

Home Assistant is outside the runtime. The repository defines only a future handoff event shape; it owns no HA token, host, entity state, or control path. See `docs/home-assistant-contract.md`.
