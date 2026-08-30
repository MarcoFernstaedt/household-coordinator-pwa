# CLAUDE.md

## Product mission

Household Coordinator is a privacy-first, self-hosted TypeScript PWA for shared chores, groceries, and generic routine pet-care handoffs. This public repository is standalone. It must contain only source, documentation, tests, and deterministic fictional fixtures—never real household data, credentials, private infrastructure, private topology, or claims of a live personal deployment.

Read, in order: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/security-and-privacy.md`, `docs/offline.md`, `docs/api.md`, `docs/accessibility.md`, `docs/migrations.md`, then relevant source/tests.

## Technical shape

- React/Vite client in `src/client/`.
- Fastify API and Node SQLite persistence in `src/server/`.
- Zod at every public input boundary; Argon2id for passwords.
- Vitest for unit/API/DOM security and accessibility tests.
- Playwright for exact built-app Chromium/Firefox acceptance.
- `migrations/` for additive SQL; `tools/` for migration and public-boundary verification.
- Locked npm dependency graph. Do not introduce another language/runtime or overlapping framework without a reviewed need.

## MVP allowlist

Only these product capabilities are allowed:

1. Chores: create, same-household assignment, due date, complete/reopen, version/conflict.
2. Groceries: add bounded quantity/note, check/uncheck, authorized clear-completed.
3. Generic pet profile and feeding/walk/medication-note routine records, completion, and handoff. This is not medical advice or medication management.
4. Owner/member accounts with server-enforced household realm isolation.
5. Owner-created random opaque guest grants that are realm-bound, purpose/action scoped, future-expiring, and immediately revocable.
6. Installable responsive PWA.
7. Truthful offline behavior after first authorized sync: labelled cache, stable idempotency keys, visible Pending, reconnect sync, explicit conflicts, and no guest sync after expiry/revocation.
8. Anonymous deterministic fictional browser-only demo, one dedicated storage key, Reset Demo, zero API writes, zero analytics, and no path into account realms.
9. A documentation-only Home Assistant handoff contract. Home Assistant remains sole smart-home authority.

Deny AI, finance, payments, retailer ordering, messaging, medication management, medical advice, emergency behavior, cameras, precise location/history, analytics, advertising, external OAuth/provider secrets, public household realms, private infrastructure, live personal deployment, and any Home Assistant token/host/entity mirror/control/connector.

## Authority invariants

- Every household record query includes the authenticated/grant household ID.
- Never trust household, role, owner, member, or guest authority from request payloads or UI state.
- Foreign and unknown IDs return one generic not-found shape.
- Owner controls membership and guest grants. Members use only documented household actions.
- Guest token bytes are returned once and only their SHA-256 digest is persisted.
- Guest authorization evaluates closed action, realm, `now < expiresAt`, and `revokedAt IS NULL` immediately before every action.
- Passwords are Argon2id-hashed. Session IDs and CSRF values are random; stored session/CSRF values are hashed.
- Cookies are HttpOnly, SameSite Strict, bounded, and Secure in production. Writes require exact allowed Origin plus CSRF.
- Login errors are generic and bounded by rate limiting.

## Offline/idempotency/conflict invariants

- A replayable mutation receives one UUID idempotency key and keeps it across every retry.
- Receipt and mutation are atomic. A duplicate key returns the original safe response and never repeats the side effect.
- Mutable records carry `version`; writes require `expectedVersion`.
- Mismatch returns 409, current version, preserved input, and explicit user reconciliation. Never silently overwrite or auto-merge.
- Queue states are truthful: pending, syncing, conflict, blocked, failed, or removed after confirmed 2xx.
- Offline transport loss remains pending; it does not become success.
- At or after guest expiry, or after known revocation, block before transport. A 401/403 blocks future automatic retry.
- Service worker caches same-origin GET shell/assets only; never `/api/`, writes, credentials, sessions, CSRF values, raw guest tokens, or other origins.

## Accessibility/UX invariants

- Mobile-first from 320 CSS pixels through desktop; comfortable touch targets and one-handed flow.
- Semantic headings/landmarks/lists/forms, native controls, keyboard completion, visible focus, logical focus restoration, and exactly one polite live region.
- No hover-only, pointer-only, color-only, motion-only, or position-only meaning.
- Loading, empty, offline, pending, conflict, expired, revoked, forbidden, validation, server-error, and success states preserve input and name safe recovery.
- Support reflow/zoom, reduced motion, forced colors, meaningful screen-reader labels, and supported-browser parity.
- Axe/Playwright are necessary but do not prove NVDA, VoiceOver, true browser UI zoom, or OS high contrast. Keep manual scripts and claims honest.

## Security/privacy invariants

- Bound every external string/array/UUID/datetime/version with Zod and keep Fastify body limits.
- Use parameterized SQL, STRICT tables, foreign keys, transactions, indexes, additive migrations, disposable migration tests, and documented backup rollback.
- Sanitize errors/logs. Never log credentials, cookies, CSRF, guest tokens, passwords, payload contents, database paths, or private identifiers.
- Keep strict CSP and defensive browser headers.
- No arbitrary URL, proxy, redirect, upload, file, command, template, webhook, callback, or provider surface.
- `.env.example` contains placeholders only. Real values are never committed.
- Demo data is fictional, deterministic, isolated, resettable, and transport-free.
- Current tree, build/package output, stage, exact export, history, metadata, ignored/untracked state, and GitHub alerts must be free of unexplained secrets, PII, private paths/topology, or personal terms. Scanner tests must include effective canaries.

## Strict vertical TDD

For every behavior:

1. Write one focused test first.
2. Run it; observe the expected semantic RED failure.
3. Implement the smallest production change.
4. Run focused GREEN, then affected/governing tests.
5. Refactor only while green.
6. Repeat vertically.

No production behavior before its failing test. Do not batch a speculative test pile, weaken assertions, suppress failures, or retry blindly. Debug by reproducing, reducing, hypothesizing, probing, fixing the cause, and adding regression evidence.

## Exact verification

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run migration:check
npm run test:e2e
npm audit --audit-level=high
npm run scan:public
npm run scan:history
git diff --check
```

`npm run verify` does not subsume migration, coverage, browser, runtime, exact-export, hosted-CI/security, or manual assistive-technology gates. Record each separately.

Runtime smoke uses a new temporary database and the exact built server/client with explicit `DATABASE_PATH`, `APP_ORIGIN`, host, port, and environment. Exercise health plus owner/member main workflows. Stop and delete only review-owned temporary state.

## Repository discipline

Prove repository root, branch, HEAD/unborn base, full status, remotes, and worktrees before writes. Exactly one writer owns the mutable tree/index/branch. Reviewers are read-only and bound to an exact candidate. Preserve unrelated work. Never stash, reset, clean, overwrite, rewrite, delete, force-push, deploy, or mutate another runtime under this contract.

For unborn history, inspect every untracked file before staging. Stage exact paths only after all artifacts exist. Review cached bytes, package/lockfile, generated/ignored artifacts, secret scope, and history metadata. Use a GitHub noreply author/committer address.

## Release sequence

1. Complete local source, docs, migration, coverage, runtime, browser, offline, security, advisory, privacy/history, export, deterministic build, accessibility, and diff gates.
2. Freeze exact identity and stop writers.
3. Obtain fresh independent exact-byte security/accessibility/release review.
4. Correct under TDD, rerun, refreeze, and re-review after every byte change.
5. Create one clean root commit.
6. Create GitHub repository PRIVATE first; configure professional description/topics, issues on, wiki off.
7. Push `main` without force; verify server SHA and default branch.
8. Require hosted CI success on that exact SHA.
9. Enable and verify private vulnerability reporting and Dependabot; require zero open high/critical Dependabot alerts and zero local current/history/package scan findings.
10. If GitHub secret scanning cannot run while the repository is private, change visibility to PUBLIC only for a fail-closed hosted security verification window.
11. Immediately enable and query GitHub secret scanning and push protection. If either is unavailable or any secret alert exists, make the repository PRIVATE again, verify the rollback, and stop.
12. Continue public release only after GitHub reports zero open secret alerts.
13. Verify anonymous repository/README/LICENSE/security pages, branch SHA/tree, advertised refs, clean clone, scans, and exact-SHA CI.

No private deployment, Home Assistant mutation, service restart, runtime cutover, merge, or force push is authorized.

## Stop/rollback

Stop private/local on access-control ambiguity, cross-realm leak, guest authority defect, duplicate/lost offline mutation, misleading state, secret/private finding, accessibility blocker, dependency/license issue, flaky/failing gate, scanner failure, rejected review, CI mismatch, or unresolved GitHub alert.

Before release, preserve local/private state. After release, immediately make the repository private on material exposure and verify actual rollback. Never improvise a history rewrite. Database recovery requires a verified backup and the procedure in `docs/migrations.md`.

## Definition of done

Done requires all allowlisted behavior and negative states; proven server realm/role/guest authorization; proven idempotency/conflicts/offline/demo/PWA behavior; current docs; clean format/lint/type/tests/coverage/build/migration/advisory/privacy/history/export/runtime/Chromium/Firefox-where-available/accessibility/security evidence; exact-byte independent PASS after final bytes; clean root history and noreply metadata; private-first exact-SHA hosted CI/security PASS; anonymous public readback; and zero prohibited data, integration, deployment, or runtime mutation.
