# AGENTS.md

## Mission

Build and maintain Household Coordinator as a privacy-first, self-hosted TypeScript PWA for chores, groceries, and generic routine pet-care handoffs. The public repository is a standalone product and synthetic engineering demonstration. It must never contain non-public household data, private infrastructure, credentials, live integrations, or claims of a deployed personal system.

## Reading order

1. `AGENTS.md` and `CLAUDE.md`
2. `README.md`
3. `docs/architecture.md`
4. `docs/security-and-privacy.md`
5. `docs/offline.md`
6. `docs/api.md`
7. `docs/accessibility.md`
8. `docs/migrations.md`
9. Relevant source and tests

## Architecture and paths

- `src/client/` — React UI, deterministic demo store, and offline queue.
- `src/server/app.ts` — Fastify app, SQLite schema, domain routes, authentication, authorization, concurrency, and idempotency.
- `src/server/index.ts` — validated runtime configuration, static serving, listening, and shutdown.
- `migrations/` — reviewable additive SQL migrations.
- `tests/api/` — API, realm, role, guest, idempotency, conflict, migration, and security tests.
- `tests/client/` — offline, demo, DOM, and Axe tests.
- `tests/e2e/` — exact built-app Chromium/Firefox acceptance.
- `tools/` — deterministic public-boundary and migration verification.

Use one coherent locked TypeScript stack: Node.js, Fastify, SQLite, Zod, Argon2id, React, Vite, Vitest, Playwright, ESLint, and Prettier. Do not add a second backend language or overlapping framework without a demonstrated need and approved architecture change.

## Domain contract

Bounded MVP:

- Chores: create, same-household assign, due date, complete/reopen, version/conflict state.
- Groceries: add bounded name/quantity/note, check/uncheck, and authorized clear-completed.
- Pet care: generic pet profile and feeding/walk/medication-note routine records, completion, and handoff. Medication-note is not medical advice or medication management.
- Owner/member accounts in one household realm per user.
- Owner-created guest grants with one purpose, closed action allowlist, realm binding, expiry, and immediate revocation.
- Offline after first authorized sync: labelled cache, stable idempotency key, visible Pending, reconnect sync, explicit conflict recovery, and no guest sync after expiry/revocation.
- Anonymous deterministic fictional demo in isolated browser-only storage with Reset Demo, no API writes, and no analytics.
- Home Assistant is a non-connected handoff contract only and remains sole smart-home authority.

Prohibited:

- AI assistant; finance; payments; retailer ordering; messaging; medication management; medical advice; emergency logic; cameras; precise location/history; analytics; advertising; external OAuth/provider secrets; public household realm; private infrastructure; live personal deployment; Home Assistant token, host, entity mirror, control, or connector.

## Authentication and authorization

- Enforce household realm scope in every server query. Never accept a client-provided household or role as authority.
- Unknown and foreign records use the same not-found shape.
- Owners administer members and guest grants. Members may perform only explicitly documented household actions.
- Passwords use the reviewed Argon2 library. Sessions are random, stored hashed, HttpOnly, SameSite Strict, Secure in production, and bounded in time.
- Every write requires exact-origin and CSRF validation.
- Login failures are generic and rate-limited.
- Guest credentials are 256-bit opaque random values stored only as SHA-256 digests, returned once, and evaluated synchronously for scope, realm, expiry, and revocation before every action.
- Guest expiry is exclusive: access is denied at `now >= expiresAt`.

## Offline and concurrency

- Every replayable mutation uses one UUID idempotency key for its complete lifetime.
- Store mutation and replay receipt atomically where an endpoint participates in offline replay.
- Mutable records carry a positive integer version. Stale writes return HTTP 409 and preserve both local input and current server version for explicit reconciliation.
- Never report queued, sent, or conflicted work as successful.
- Do not cache `/api/`, writes, sessions, CSRF values, passwords, or raw guest credentials.
- Block guest queue entries before transport when expired or revoked; a server 401/403 blocks further automatic retry.
- Service-worker cache upgrades delete retired shell caches and remain same-origin GET-only.

## Accessibility and UX

- Mobile-first from 320 CSS pixels through desktop with comfortable touch targets and one-handed use.
- Use semantic headings, landmarks, lists, forms, native controls, visible focus, keyboard-complete interaction, logical focus restoration, and one polite live region.
- No state may depend on color, hover, pointer, motion, or position alone.
- Cover loading, empty, offline, pending, conflict, expired, revoked, forbidden, validation, server-error, and success states. Preserve input and name a safe recovery.
- Support reflow/zoom, reduced motion, forced colors, screen-reader labels, and browser parity.
- Automated checks do not prove NVDA, VoiceOver, true browser UI zoom, or OS high-contrast acceptance; document those as manual until physically run.

## Security and privacy

- Validate and bound every external value with Zod.
- Use parameterized SQLite statements, foreign keys, STRICT tables, transactions, indexes, and safe additive migrations.
- Keep response errors and logs sanitized. Never log credentials, cookies, CSRF values, guest tokens, password material, private paths, or record payloads.
- Maintain strict CSP and defensive browser headers.
- Do not add arbitrary URL fetch/proxy, file read/write, command execution, upload, template expression, redirect, webhook, or provider callback surfaces casually.
- Keep `.env.example` placeholder-only. Real secrets belong in an operator-approved secret mechanism.
- The synthetic demo must remain fictional, deterministic, isolated to its dedicated storage key, resettable, and unable to reach account code paths.

## TDD and implementation loop

Use strict vertical RED → GREEN → REFACTOR:

1. Write one minimal behavior test first.
2. Run it and confirm it fails for the expected missing behavior—not a typo or environment error.
3. Write the smallest production change that passes.
4. Run the focused test, then affected tests.
5. Refactor only while green.
6. Repeat for the next vertical behavior.

No production behavior without a previously observed failing test. Configuration/generated artifacts are verified directly. Fix root causes; do not weaken tests, suppress errors, or add blind retries.

## Exact commands

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

`npm run verify` runs format, lint, typecheck, unit/API/DOM tests, build, audit, current-tree scan, and reachable-history scan. Browser, migration, runtime, coverage, export, and hosted security gates remain separate required release evidence.

## Repository and one-writer rules

Before writing, prove exact root, branch, HEAD/unborn state, status including untracked files, remotes, and worktrees. Exactly one writer owns a mutable repository/worktree/branch/index at a time. Reviewers are read-only and bound to an exact candidate. Preserve all existing work; never stash, reset, clean, overwrite, rewrite history, force-push, or broaden scope without exact approval.

For an unborn repository, enumerate and inspect every untracked file. Stage only after all required artifacts exist. Review exact cached bytes and rerun governing gates against index/worktree-identical content.

## Public/private boundary

Current source, build output, package inventory, staged candidate, exported exact commit, reachable Git history, commit metadata, ignored/untracked files, and hosted alerts must contain no secrets, PII, private absolute paths, private topology, real household labels, or prohibited personal terms. Scanner canaries must prove detection. Synthetic fixture matches require exact semantic classification; never dismiss an unexplained finding.

## Release contract

1. Finish source, documentation, migration, runtime, browser, accessibility, offline, security, advisory, privacy, history, export, and deterministic-build gates locally.
2. Freeze exact candidate identity. Stop all writers.
3. Obtain a fresh independent read-only security/accessibility/release review of exact bytes.
4. Correct findings under TDD, rerun all affected/governing gates, refreeze, and re-review.
5. Create one clean root commit with a GitHub noreply author/committer address.
6. Create the GitHub repository PRIVATE first; push only `main` without force and verify exact server SHA/default branch/visibility.
7. Require hosted CI success on the exact SHA. Enable and verify vulnerability reporting, Dependabot, secret scanning, and push protection where available.
8. Require GitHub itself to report zero open high/critical Dependabot alerts and zero open secret alerts.
9. Only then change visibility to PUBLIC.
10. Verify anonymously: repository, README, license, security policy, branch SHA/tree, advertised refs, clean clone, current/history scans, and exact-SHA CI.

No deployment, service restart, Home Assistant mutation, private runtime change, or force push is authorized by this repository contract.

## Stop and rollback

Stop before publication for access-control ambiguity, cross-realm leak, lost/duplicate offline mutation, misleading state, private/secret finding, accessibility blocker, dependency/license issue, failed or flaky test/build, scanner failure, review rejection, non-green exact-SHA CI, or unresolved hosted alert.

Before public release, rollback is local/private preservation only. After publication, make the repository private immediately if material exposure appears, verify the actual visibility change, preserve evidence, and report. Never improvise a history rewrite or force push. Database rollback follows `docs/migrations.md` and requires a verified backup.

## Definition of done

Done means every bounded feature and negative state is implemented; server authorization and conflict/idempotency behavior are proven; demo/offline/PWA behavior is truthful; security/privacy/accessibility requirements are satisfied; format, lint, typecheck, tests, coverage, build, migration, audit, scanners, exact export, runtime, Chromium, Firefox where available, and manual-gate documentation are complete; final diff/history/metadata are clean; independent exact-byte review passes; hosted exact-SHA CI/security gates pass; anonymous public readback passes; and no prohibited runtime or data was touched.
