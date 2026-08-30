# CLAUDE.md — Household Coordinator

## Mission and execution contract

Build and maintain **Household Coordinator** as a privacy-first, self-hosted, installable TypeScript PWA for coordinating shared chores, a shared grocery list, and generic routine pet-care handoffs.

This instruction file must work against either the current implementation or a fresh clone at a different revision. **Audit before coding.** The repository may already satisfy some or most requirements. Preserve verified working behavior, tests, documentation, dependencies, and public-safe fixtures. Close proven gaps with the smallest coherent changes; do not scaffold a replacement application, rewrite working modules, rename broad surfaces, or churn dependencies merely because another design is possible.

The consumer is a small household, not an enterprise SaaS product. Keep the implementation bounded, understandable, mobile-first, self-hostable, and suitable as a public engineering portfolio sample. Use only deterministic fictional data in source, tests, screenshots, and documentation.

## Order of authority and reading order

1. This `CLAUDE.md` defines implementation scope and gates.
2. `AGENTS.md` defines repository safety, established architecture, and contributor rules.
3. `README.md` defines the public product claim.
4. Read all of `docs/`, especially:
   - `docs/architecture.md`
   - `docs/security-and-privacy.md`
   - `docs/offline.md`
   - `docs/api.md`
   - `docs/accessibility.md`
   - `docs/demo.md`
   - `docs/home-assistant-contract.md`
   - `docs/migrations.md`
5. Read `package.json`, lockfile, CI, configuration, migrations, current source, and all tests before changing behavior.

When documents conflict, do not silently choose one. Treat the safer/narrower behavior as the temporary boundary, record the conflict, and update all authoritative documents together only after tests establish the intended contract.

## First action: prove and audit the current state

Before any write, run and record:

```bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git log -1 --oneline
git remote -v
git worktree list --porcelain
node --version
npm --version
```

Then:

1. Confirm the canonical repository root is the intended Household Coordinator repository.
2. Read every tracked project file, excluding dependency/build output except where needed to audit generated behavior.
3. Inventory routes, screens, data tables, migrations, queue states, tests, scripts, CI gates, and documentation claims.
4. Map every requirement in this file to one of:
   - **verified complete** — source plus a meaningful passing test proves it;
   - **partially complete** — useful code exists, but a contract, negative case, UI state, or test is missing;
   - **absent** — no implementation evidence;
   - **conflicting/unknown** — source, tests, and docs disagree or evidence is insufficient.
5. Run the baseline verification commands that are safe in the current worktree. Distinguish baseline failures from regressions. Do not “fix” by weakening tests.
6. Produce a short implementation checklist based on actual gaps. Do not implement an item classified verified complete.

A known historical implementation used React/Vite, Fastify, Node SQLite, Zod, Argon2id, Vitest, and Playwright, with source under `src/client/` and `src/server/`. That is orientation, not proof of the clone in front of you. Reverify it.

### Current-revision audit targets, not assumptions

If the inspected revision resembles the implementation that already has an account workspace, domain APIs, synthetic demo, offline queue, and PWA shell, explicitly verify these likely gap areas before adding features:

- whether authenticated data is safely and truthfully available after first authorized sync, rather than only the shell and mutation queue;
- whether every intended replayable mutation—not just grocery creation—has a usable offline UI path;
- whether conflicts occur only for versioned mutations and preserve both local input and current server state;
- whether idempotency receipts are bound to the same authenticated actor, realm, route/method, and canonical request payload, so key reuse with different input cannot return an unrelated response;
- whether optimistic writes are race-safe at the SQL update boundary and a zero-row compare-and-swap becomes a 409 rather than false success;
- whether purpose-scoped guest access is usable end to end, not merely issuable, while remaining token-safe, expiring, revocable, and fail-closed;
- whether advertised guest scopes exactly match implemented guest actions;
- whether all documented loading, empty, offline, pending, conflict, blocked, expired, revoked, forbidden, validation, server-error, and recovery states exist in the UI and tests;
- whether startup schema behavior and numbered SQL migrations have one authoritative, drift-tested definition;
- whether public claims match executable behavior.

Do not treat this list as permission to redesign or expand scope. Verify each target first.

## Approved users and authority

There are exactly these user classes:

1. **Owner** — authenticated household account; creates the household, manages member accounts, creates/revokes guest grants, and performs all ordinary household actions in that owner’s realm.
2. **Member** — separate authenticated account in exactly one household realm; performs documented shared-household actions but cannot administer membership or guest grants.
3. **Guest** — no household account; uses one opaque, purpose-scoped, realm-bound, action-limited grant until exclusive expiry or revocation. A guest receives no authority beyond the closed action allowlist.
4. **Anonymous demo visitor** — no account and no access to any real realm; uses only deterministic fictional browser-local demo state.
5. **Self-host operator** — configures and runs the app locally or on infrastructure outside this repository. Operator status does not become application owner/member authority.
6. **Contributor/reviewer** — works only on source and synthetic disposable state. Contributor access conveys no household access.

Do not hard-code real people, relationship labels, addresses, pet details, email addresses, household names, schedules, infrastructure, or topology. Product language should say “owner,” “member,” “household,” “guest,” and “pet” unless a deterministic fictional fixture is clearly labelled as a demo.

## Approved product workflows

### Owner and member accounts

- First-owner setup creates one household realm and one owner account.
- Existing owner/member signs in and signs out using a separate account.
- Owner creates a member in the current realm; member authority is never client-selected.
- Workspace shows only the active authenticated realm and safe user-facing identity fields.
- Authentication, loading, empty, expired-session, forbidden, validation, server-failure, and recovery states preserve input where safe.

### Chores

- Create a bounded-title chore with due date/time.
- Optionally assign it only to a user in the same household.
- List current-household chores.
- Complete or reopen with optimistic version checking.
- Owner may update any realm chore; member may update only actions explicitly authorized by the documented policy, including assignment restrictions.
- A stale change enters explicit conflict recovery; it never silently overwrites.

### Groceries

- Add bounded name, quantity, and optional note.
- List current-household items.
- Check or uncheck with optimistic version checking.
- Authorized owner/member may clear completed items.
- Offline-capable mutations are visibly queued and replay-safe.

### Generic pet care

- Create a generic pet profile with bounded name/species labels.
- Create feeding, walk, or `medication-note` routine records.
- Complete a routine with bounded handoff text and optimistic version checking.
- Every medication-note surface says: `Routine record only — not medical advice.`
- This is a coordination log only: no dosage, prescription, diagnosis, medical recommendation, adherence decision, emergency action, or medication-management workflow.

### Guest access

- Owner creates a 256-bit random opaque grant for a named purpose, one household realm, a closed set of implemented actions, and a future expiry.
- Raw token is displayed/returned once. Persist only its SHA-256 digest.
- Owner can revoke immediately.
- Guest can use only explicitly implemented guest surfaces/actions. Unknown, malformed, expired, revoked, unsupported-scope, and foreign-realm use fails closed.
- Expiry is exclusive: deny when `now >= expiresAt`.
- Guest work queued before authority loss must never be sent after known revocation or at/after expiry. A server 401/403 blocks automatic retry.

Do not advertise or issue a guest scope until the corresponding server authorization, realm query, UI, expiry/revocation behavior, and negative tests all exist. Do not add broad sharing links or public realm URLs.

### Anonymous synthetic demo

- Default portfolio surface works without an account.
- State is deterministic, fictional, resettable, and stored under one dedicated namespaced browser key.
- Demo makes zero API writes, loads no private account state, stores no session/CSRF/guest data, uses no analytics, and has no path into an authenticated realm.
- “Reset demo” recreates the exact seed and announces completion accessibly.
- Demo and account surfaces remain visibly and architecturally distinct.

### Installable/offline PWA

- Installable responsive shell works after first successful load.
- Service worker caches only same-origin GET shell/static assets, never `/api/`, writes, credentials, cookies, CSRF, raw guest tokens, or third-party origins.
- Retired shell caches are deleted safely on activation.
- Authenticated offline capability begins only after a successful authorized sync. Any cached projection is labelled with its last successful sync time and active realm/user identity, is schema-validated and bounded, and must never appear under a different account.
- Offline data is convenience state, not authority. On reconnect, the server reauthorizes every operation.
- No UI may label queued, sent, cached, or conflicted work as saved/successful.

### Home Assistant boundary

Home Assistant remains the sole smart-home state and control authority. This repository may contain only the documented future one-way handoff contract. Do not add an HA host, token, entity ID, state mirror, discovery, webhook, service call, control, connector, private adapter, or delivery claim. Any future connector requires a separate explicit approval and threat review outside this mission.

## Explicitly prohibited scope

Do not add:

- AI assistant or recommendations;
- finance, payments, budgets, commerce, retailer ordering, or delivery integration;
- chat, SMS, email, push messaging, or social features;
- medical advice, dosage, prescriptions, medication management, emergency behavior, or health inference;
- cameras, microphones, biometrics, precise location, or location history;
- analytics, advertising, telemetry, tracking pixels, session replay, or third-party fonts/scripts;
- OAuth/social login, external identity providers, arbitrary provider credentials, or secret-bearing demo configuration;
- public household realms, searchable profiles, broad share links, or multi-tenant admin consoles;
- arbitrary URLs, fetch/proxy endpoints, redirects, uploads, filesystem access, template execution, commands, callbacks, or webhooks;
- Home Assistant connectivity or smart-home control;
- private infrastructure, private deployment configuration, live household data, or claims of a live personal deployment.

YAGNI applies. Do not add notifications, recurrence engines, calendars, themes, localization frameworks, realtime sockets, background jobs, or complex abstractions unless a requirement above cannot be met without them and the change is explicitly approved.

## Architecture and file ownership

Preserve the established single TypeScript stack when present:

- `src/client/App.tsx` — top-level switch between synthetic demo and account/guest surfaces; no authority decisions.
- `src/client/AccountApp.tsx` — authenticated workflows and accessible UI state. If it is too large for safe changes, extract narrow domain components without rewriting behavior.
- `src/client/api.ts` — same-origin transport, safe response parsing, CSRF header handling, and typed API errors.
- `src/client/demo.ts` — deterministic fictional demo state and dedicated storage adapter only.
- `src/client/offlineQueue.ts` — validated, bounded, realm/user-bound mutation state machine with stable idempotency keys.
- `src/client/styles.css` — mobile-first styles, focus, reflow, reduced motion, and forced-colors support.
- `src/server/app.ts` — Fastify app factory, routes, authentication/authorization, validation, transactions, idempotency, and safe errors. Extract cohesive internal modules only when doing so reduces risk and tests preserve contracts.
- `src/server/index.ts` — validated runtime configuration, exact-origin setup, static serving, startup, and graceful shutdown.
- `migrations/*.sql` — numbered additive schema migrations; released migrations are immutable.
- `public/sw.js`, `public/manifest.webmanifest`, icons — bounded PWA assets and shell-cache behavior.
- `tests/api/` — route contracts, realm/role/guest authorization, CSRF/origin/session, concurrency, idempotency, and migration behavior.
- `tests/client/` — demo isolation, API client, offline queue, accessible states, and UI workflows.
- `tests/e2e/` — exact built-app PWA, responsive, keyboard, network-boundary, offline, and recovery acceptance.
- `tests/security/` and `tools/` — public-boundary canaries/scanners and policy tests.
- `docs/` — architecture and user/operator contracts; update when executable behavior changes.

Prefer small pure functions and explicit types. Share schemas/constants only when doing so creates one real source of truth without coupling browser code to server-only dependencies. Do not introduce a second backend language, ORM, state-management framework, CSS framework, UI kit, or database.

## Authentication, realm, and session contracts

- The browser is untrusted. Never accept `householdId`, realm, role, owner/member status, or grant authority from request payloads, query parameters, route state, local storage, or UI labels.
- Derive account realm and role only from the authenticated server-side session and database.
- Every realm-bearing record query and mutation includes the authorized household ID in the SQL predicate.
- Foreign and unknown record IDs return the exact same generic not-found shape. Do not leak through status, timing-sensitive branches where avoidable, messages, counts, or validation order.
- Passwords are 14–128 characters and use reviewed Argon2id defaults/configuration. Never log or return hashes.
- Session IDs and CSRF values use cryptographically random bytes. Persist only hashes. Sessions are bounded and revocable.
- Session cookie is `HttpOnly`, `SameSite=Strict`, path-bounded, and `Secure` in production. Production requires an exact HTTPS `APP_ORIGIN`.
- Every state-changing account request requires both an exact allowlisted `Origin` and the session’s CSRF token. CORS is not an authorization mechanism.
- Login responses are generic and rate-limited. Avoid account enumeration.
- Setup behavior must be intentional: prove whether multiple independent household realms are supported. Never allow an unauthenticated setup path to join or modify an existing realm.
- Owner-only routes enforce owner role on the server, not only by hiding controls.
- Session expiry, logout, malformed cookies, missing CSRF, wrong CSRF, missing origin, foreign origin, cross-realm IDs, and member attempts at owner operations require negative tests.

## Guest contract

- Generate at least 256 bits with a CSPRNG and encode as an opaque value.
- Return raw token once; do not store it in logs, database, browser persistent storage, URLs, referrers, screenshots, fixtures, or analytics.
- Persist SHA-256 digest, household ID, creator ID, purpose, canonical closed action set, created time, expiry, and nullable revocation time.
- Evaluate token digest, grant realm, requested action, `revokedAt IS NULL`, and `now < expiresAt` immediately before every guest action.
- Scope names are closed enums. Unknown and unimplemented values fail validation/authorization; never ignore them.
- Unknown, expired, revoked, and otherwise unavailable grants return one generic unavailable response. An authenticated but out-of-scope action returns a safe forbidden response without realm data.
- Revocation is idempotent and realm-confined. A foreign/unknown grant must not reveal existence.
- Guest responses contain only fields needed for the allowed purpose.
- If a guest UI is provided, keep the credential in ephemeral memory where practical, clearly name expiry/scope, and provide expired/revoked recovery without falling into account routes.

## Offline queue, idempotency, and conflict contracts

### Queue state machine

Use only truthful states:

- `pending` — retained locally; no server success implied;
- `syncing` — exactly one active attempt;
- `conflict` — server returned 409; local input and server state/version remain available for a user decision;
- `blocked` — authority unavailable; no automatic retry;
- `failed` — safe server failure; input retained and deliberate retry available;
- success — remove the exact entry only after a confirmed 2xx matching the request.

Persist a schema version. Validate loaded data, cap item count and field/body size, reject malformed/unknown records, and partition by authenticated realm plus user. Never flush another realm/user’s queue after account switching. Never persist passwords, cookies, CSRF values, raw guest tokens, or unbounded server payloads.

### Idempotency

- Generate one UUID idempotency key when a replayable intent is created and retain it unchanged across transport retries.
- Deduplicate local enqueue by key.
- On the server, scope receipts to authenticated principal/grant and realm, plus HTTP method and canonical route/operation.
- Bind the receipt to a cryptographic hash of the canonical validated request. Reusing a key with different method, route, or payload returns a safe 409/422 idempotency mismatch; it never returns an unrelated prior response and never performs a new mutation.
- Store the domain mutation and success receipt atomically in one transaction.
- Duplicate valid replay returns the original safe status/body without repeating the side effect.
- Define bounded receipt retention/cleanup without allowing a still-retryable client operation to duplicate unexpectedly.
- Test duplicate delivery, same-key/different-body, same-key/different-route, cross-user, cross-realm, rollback-before-receipt, and retry-after-transport-loss.

### Optimistic concurrency

- Every mutable shared record has a positive integer `version`.
- Versioned writes require `expectedVersion`.
- Perform compare-and-swap in the mutation SQL: `... WHERE id = ? AND household_id = ? AND version = ?`.
- Check affected row count inside the transaction. Zero rows must be classified using a realm-safe lookup as not-found or version conflict; never report success.
- A 409 response contains a stable error code and enough safe current record/version data for explicit reconciliation. The client preserves the attempted local input.
- User chooses discard local or retry against the current version. Retry is a new user-confirmed intent with contract-consistent idempotency semantics. Never silently overwrite, last-write-wins, or auto-merge.

### Connectivity behavior

- Only transport failures become/remain `pending`; HTTP validation/auth/server responses become the appropriate explicit state.
- Sync sequentially unless an ordering model is proven safe.
- Reauthorize on every replay.
- At or after guest expiry, or after known revocation, block before transport.
- A guest 401/403 blocks future automatic retries.
- Account 401 ends automatic sync and asks the user to sign in; do not mislabel it as offline.
- A cached workspace is visibly stale/offline and read-only except for explicitly queue-supported actions.

## API and database contracts

- Same-origin JSON API lives under `/api` unless the audited repo proves another documented contract.
- Validate and bound params, headers, bodies, strings, arrays, UUIDs, datetimes, versions, and enums with Zod at the public boundary.
- Reject unknown fields for security-sensitive payloads when compatibility permits; do not silently accept authority-like fields.
- Keep request bodies bounded (historically 32 KiB); use smaller field-level bounds.
- Stable safe errors use a documented shape such as `{ "error": "stable_code", "message": "safe recovery" }` with optional bounded conflict data.
- Use parameterized SQL, foreign keys, STRICT tables, constraints, indexes, and transactions.
- Keep one authoritative migration path. Startup schema creation and `migrations/*.sql` must not drift. Prefer applying versioned migrations rather than maintaining duplicated schema strings.
- Released migrations are immutable. Future migrations are additive and tested from empty and previous schema state.
- Health exposes only safe status, never paths, configuration, user counts, versions that increase attack surface, or dependency details.
- Sanitize framework/SQLite/validation failures; never return stacks or internal paths.
- No arbitrary URL, proxy, redirect, upload, file, command, template, callback, or webhook surface.

## Strict vertical TDD

Every behavior change follows **RED → GREEN → REFACTOR**, with the failure observed before production code:

1. Select one smallest externally meaningful behavior.
2. Write or tighten one focused test at the lowest sufficient layer.
3. Run only that test and confirm semantic RED: it fails because the behavior is missing/incorrect, not because of syntax, fixture, environment, or unrelated baseline failure.
4. Make the smallest production change to pass.
5. Run focused GREEN.
6. Run the affected domain file(s).
7. Refactor only while green.
8. Run governing unit/API/DOM tests.
9. Commit/checkpoint only a coherent verified unit if repository mutation/commits were explicitly authorized.
10. Repeat vertically.

Never write a speculative pile of tests, implement production behavior before its failing test, weaken assertions, over-mock authorization/database behavior, replace behavioral checks with snapshots, suppress failures, add blind retries, or update snapshots merely to obtain green.

### Exact focused commands

Use project-local tools and current scripts. Examples for the established repository:

```bash
npm test -- tests/api/auth-realm.test.ts
npm test -- tests/api/chores.test.ts
npm test -- tests/api/groceries.test.ts
npm test -- tests/api/pet-care.test.ts
npm test -- tests/api/guests.test.ts
npm test -- tests/api/workspace.test.ts
npm test -- tests/client/offline-queue.test.ts
npm test -- tests/client/demo.test.ts
npm test -- tests/client/app.test.tsx
npm test -- tests/security/public-scan.test.ts
npx playwright test tests/e2e/pwa.spec.ts --project=chromium
npx playwright test tests/e2e/pwa.spec.ts --project=firefox
```

For a new gap, add the narrowly named test beside the owning contract. Examples:

- `tests/api/idempotency.test.ts`
- `tests/api/concurrency.test.ts`
- `tests/api/migrations.test.ts`
- `tests/client/account-cache.test.ts`
- `tests/client/guest-access.test.tsx`

Do not create these files if existing tests are the clearer home.

## Accessibility and UX acceptance

Accessibility is architectural, not polish:

- Mobile-first from 320 CSS pixels through desktop; no horizontal page scroll at 320 px or at 400% reflow.
- Comfortable touch targets, one-handed primary flows, and no drag-only interaction.
- Semantic landmarks, logical headings, lists, labels, fieldsets where needed, and native controls first.
- Complete keyboard operation, visible focus, sensible tab order, deterministic focus placement/restoration after surface changes, dialogs, conflict choices, guest creation/revocation, and sign-out.
- Exactly one restrained polite live region for dynamic action announcements; avoid duplicate `role=status`/live-region speech.
- No color-only, hover-only, pointer-only, motion-only, icon-only, or position-only meaning.
- Support reduced motion and forced colors. Do not remove focus outlines.
- Loading, empty, offline, cached/stale, pending, syncing, conflict, blocked, expired, revoked, forbidden, validation, session-expired, server-error, and success states preserve input where safe and name a recovery action.
- Long household labels, one-time guest credentials, dates, notes, and validation messages must wrap/reflow.
- Use human language, not API codes, while retaining codes for tests/log-safe diagnostics.
- Automated Axe/DOM/Playwright checks are required but do not prove physical NVDA, VoiceOver, browser UI zoom, or OS high contrast. Keep manual scripts in `docs/accessibility.md` and state unrun gates honestly.

Do not claim WCAG conformance or assistive-technology pass solely from Axe.

## Security and privacy requirements

- Default deny and least privilege at every route and storage boundary.
- Threat-model IDOR/cross-realm access, CSRF, session theft/fixation, credential stuffing, guest-token disclosure, replay, lost update, XSS, injection, resource exhaustion, offline cross-account leakage, and public-repository leakage.
- Render user strings as text; no user HTML or unsafe DOM injection.
- Keep strict CSP and defensive headers: deny framing/objects, restrict sources to self, and disable unneeded sensors/payments.
- Do not log credentials, passwords, password hashes, cookies, session IDs, CSRF values, guest tokens/digests, request payloads, record contents, database paths, private identifiers, or private topology.
- Error logs, if added, are structured and redacted; user responses remain safe.
- `.env.example` contains placeholders only. `.env`, databases, logs, browser profiles, traces, screenshots with tokens, and generated credentials are never committed.
- No telemetry or third-party runtime request. Browser acceptance must assert the synthetic demo’s network confinement.
- Review dependency additions for necessity, maintenance, license, install scripts, browser/server exposure, and lockfile changes. Prefer no new dependency.
- Run public-boundary scanners with effective canaries. Every match must be explained from source; never blanket-ignore a finding.

## Public portfolio boundary

The source repository and anonymous demo are public-reference assets. Real household operation is private and outside the repository.

Permitted public content:

- source, tests, docs, CI, and MIT license;
- deterministic fictional fixtures using reserved domains such as `example.test`;
- generic architecture and threat-model language;
- local/self-host setup with placeholders.

Forbidden public content:

- real names, relationship details, household labels, addresses, emails, schedules, pet/medical details, credentials, tokens, databases, screenshots, logs, private absolute paths, hostnames, IPs, topology, account IDs, deployment configuration, or copied private service data;
- claims that a real household instance is live, secure, compliant, monitored, or deployed;
- links or instructions that expose a private realm or private infrastructure.

Before completion, scan current tracked/untracked/ignored relevant files, generated client/server output, package inventory, staged bytes if any, and reachable history with the repository tools. Synthetic-looking data is not automatically safe; verify it is deterministic and fictional.

## Deployment and external-state exclusion

This mission authorizes **local implementation and local disposable verification only**. It does **not** authorize:

- deployment, hosting, DNS, TLS, tunnels, containers on remote hosts, service installation/restart, or runtime cutover;
- access to or mutation of a real household database;
- Home Assistant access or mutation;
- GitHub repository creation, visibility changes, settings changes, releases, secrets, pages, branch protection, issue/PR mutation, push, merge, force push, tag, or publication;
- changing private infrastructure or another repository/worktree/profile.

A local server bound to `127.0.0.1` with a new disposable database is allowed for verification. Stop it and delete only the temporary state created for that run. Documentation may describe operator prerequisites, but must not embed private deployment details.

## Phased implementation plan

Execute only phases with verified gaps. At the end of each phase, run focused and governing tests and review the exact diff before continuing.

### Phase 0 — Baseline and contract reconciliation

- Prove repository/worktree/branch/HEAD/status and one-writer ownership.
- Audit requirements against source/tests/docs.
- Run baseline format, lint, typecheck, tests, build, migration, scanners, and browser gates as available.
- Reconcile inaccurate docs/README claims with tested behavior.
- Stop if the baseline is unsafe or requirements conflict materially.

### Phase 1 — Authority foundation

- Close session, origin, CSRF, setup, owner/member, and realm-isolation gaps.
- Add negative tests for foreign/unknown IDs and owner-only operations.
- Ensure every database query is realm-scoped and authority is server-derived.
- Preserve existing successful account flows.

### Phase 2 — Domain workflows and concurrency

- Close only missing chore, grocery, and generic pet-care behavior.
- Add SQL compare-and-swap row-count checks and explicit conflict payloads.
- Ensure member assignment/action policy is consistent in API, UI, docs, and tests.
- Keep medical/emergency features prohibited.

### Phase 3 — Replay-safe offline behavior

- Bind idempotency receipts to operation and canonical validated payload.
- Extend queue support only to approved replayable mutations with truthful UI.
- Add bounded, validated, realm/user-partitioned authorized cache if the requirement is not already met.
- Prove transport loss, duplicate replay, account switching, session expiry, conflict choice, and queue bounds.

### Phase 4 — Guest completion

- Align closed scopes with implemented actions.
- Complete the minimum safe guest redemption/use workflow if absent.
- Prove one-time token handling, realm scope, expiry boundary, revocation, unsupported action, and blocked offline retry.
- Do not expand to public sharing or persisted raw tokens.

### Phase 5 — PWA, accessibility, security, and documentation

- Verify exact built shell, cache boundaries/upgrades, manifest, offline reload, responsive reflow, keyboard/focus, live region, reduced motion, forced colors, and network confinement.
- Update architecture/API/offline/demo/accessibility/security/migration docs to exactly match behavior.
- Run dependency/advisory and public-boundary checks.
- Do not deploy or publish.

### Phase 6 — Final local acceptance

- Run all required local gates from a clean dependency install where feasible.
- Exercise the exact built server/client on loopback with a fresh disposable database.
- Review tracked, staged, untracked, ignored/generated, lockfile, migration, and scanner output.
- Obtain fresh read-only security/accessibility/code review for final bytes when available.
- Fix findings under TDD, rerun affected and governing gates, then stop with an evidence summary. No push/deploy is implied.

## Full verification commands

Use Node.js and npm versions required by the audited `package.json`. For the established repository, run:

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
git status --short --untracked-files=all
```

`npm run verify` is useful but does not replace separate coverage, migration, browser, runtime, manual assistive-technology, or final-diff evidence. Record every skipped/unavailable gate and reason; unavailable is not pass.

### Local built-runtime smoke

Use a unique disposable directory and loopback port. Do not source or overwrite a real `.env`:

```bash
npm run build
TMP_RUNTIME="$(mktemp -d)"
PORT=31873
DATABASE_PATH="$TMP_RUNTIME/household.sqlite"
APP_ORIGIN="http://127.0.0.1:$PORT"
NODE_ENV=development HOST=127.0.0.1 PORT="$PORT" DATABASE_PATH="$DATABASE_PATH" APP_ORIGIN="$APP_ORIGIN" npm start >"$TMP_RUNTIME/server.log" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; rm -rf "$TMP_RUNTIME"; }
trap cleanup EXIT INT TERM
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/health" && break
  sleep 1
done
curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/health"
```

Then use automated API/Playwright tests against disposable state for owner/member workflows, realm denial, guest expiry/revocation, idempotent replay, conflict recovery, and offline behavior. Do not use real identities or data. Ensure cleanup runs.

## Repository discipline

- Exactly one writer owns a mutable repository/worktree/branch/index.
- Preserve all pre-existing work. Never stash, reset, clean, checkout-overwrite, rewrite history, delete branches, or force push.
- Do not modify unrelated files or reformat the entire repository.
- Stage exact paths only if commits are explicitly authorized. Review staged bytes before committing.
- Never commit generated build output, coverage, test results, browser traces, local databases, `.env`, logs, or credentials unless the repository explicitly tracks a safe deterministic artifact.
- Dependency/lockfile changes require a demonstrated need and full review.
- A reviewer is read-only and bound to an exact candidate identity. Any byte change invalidates prior exact-byte review.
- Do not claim runtime behavior from source presence, a unit test, or a build alone.

## Stop and rollback rules

Stop immediately and preserve evidence when any of these occurs:

- canonical repository/worktree/ownership is uncertain;
- unrelated or concurrent changes appear;
- requirements/documents conflict in a way that changes authority or data handling;
- cross-realm access, owner/member escalation, guest overreach, raw-token persistence, or authentication ambiguity is observed;
- an offline action can duplicate, disappear, cross accounts, send after authority loss, or be falsely reported successful;
- a conflict can silently overwrite or a compare-and-swap can falsely report success;
- real/private data, secrets, infrastructure, or prohibited personal terms are found;
- a security/privacy/accessibility blocker remains;
- a test/build/scanner is failing or flaky and root cause is unknown;
- a migration risks destructive or unapproved real-state change;
- completing the next step would require deployment, external mutation, credentials, or expanded scope.

Rollback principles:

- Revert only changes made by this task, using a reviewed patch; never erase unrelated work.
- Keep the last verified green state and make small changes so rollback is obvious.
- For disposable test databases, stop the task-owned process and delete only task-owned temporary state.
- Never improvise a production database rollback. Real database recovery requires operator approval and a verified backup procedure.
- Never rewrite Git history or change repository visibility as an improvised response.

## Definition of done

Done means all of the following are true for the inspected revision:

- Audit maps every requirement to evidence; existing working code was preserved and only proven gaps were changed.
- Owner, member, guest, anonymous demo visitor, operator, and contributor boundaries are explicit and server-enforced where applicable.
- Chore, grocery, and generic pet-care workflows and their loading/empty/error/recovery states match the approved scope.
- Realm isolation, roles, sessions, exact-origin/CSRF, generic login failure, guest scope/expiry/revocation, and foreign/unknown indistinguishability have meaningful negative tests.
- Replayable mutations have stable client keys, operation/payload-bound atomic server receipts, duplicate-replay proof, and mismatch rejection.
- Versioned mutations use SQL compare-and-swap, row-count verification, 409 current-state evidence, preserved local input, and explicit user reconciliation.
- Offline shell/cache/queue behavior is truthful, bounded, validated, realm/user-isolated, and blocks replay after authority loss.
- Anonymous demo is deterministic, fictional, resettable, browser-only, network-confined, and isolated from account/guest realms.
- Service worker never caches/intercepts API or credentials; install/offline/update behavior is tested on the exact built app.
- Mobile reflow, keyboard, focus, one-live-region, reduced-motion, forced-colors, Axe, and documented manual assistive-technology gates are honest.
- Security/privacy controls, safe errors/logging, strict input bounds, parameterized SQL, migration compatibility, CSP/headers, and dependency review are complete.
- README and all docs make only tested claims and preserve the Home Assistant non-connection boundary.
- Format, lint, typecheck, unit/API/DOM tests, coverage thresholds, build, migration check, Chromium/Firefox where available, audit, current/history public scans, runtime smoke, and `git diff --check` pass without new regressions.
- Final diff, lockfile, migrations, generated output, tracked/staged/untracked state, and public boundary are reviewed; no real household data, secrets, private infrastructure, or prohibited scope exists.
- Any unavailable physical/manual gate is clearly labelled unverified rather than passed.
- No deployment, publication, GitHub mutation, Home Assistant mutation, private runtime access, or real-data operation occurred.

Partial, assumed, flaky, undocumented, inaccessible, or unverified is not done.