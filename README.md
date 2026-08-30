# Household Coordinator PWA

A privacy-first, installable household coordinator for shared chores, grocery lists, and routine pet-care handoffs.

This repository is a bounded, production-minded MVP and public engineering sample. It combines server-enforced household isolation, owner/member accounts, expiring purpose-scoped guest grants, optimistic concurrency, replay-safe mutations, a truthful offline queue, and a deterministic synthetic demo. It contains no real household data or live integrations.

## What it demonstrates

- Mobile-first installable PWA from 320 CSS pixels through desktop.
- A same-origin account surface for first-owner setup, login/logout, member creation, chore/grocery/pet workflows, scoped guest creation/revocation, and visible offline/conflict recovery.
- Shared chores: assignment, due date, completion, reopen, and explicit version conflicts.
- Groceries: quantity, note, check/uncheck, and authorized clear-completed.
- Generic pet-care routines: feeding, walking, and medication-note records with handoff status; not medical advice.
- Server-enforced realm isolation on every data query.
- Owner and member roles; owner-only member and guest administration.
- Random opaque guest credentials stored only as SHA-256 digests, scoped to named actions, expiring, and immediately revocable.
- HttpOnly SameSite sessions, Argon2id password hashing, origin/CSRF write checks, generic login errors, and bounded requests.
- Browser-only fictional demo stored under one dedicated local-storage key; Reset Demo restores the exact seed and makes no API or analytics request.
- Offline queue with stable idempotency keys, visible pending/blocked/conflict states, and no guest replay after expiry or revocation.
- Home Assistant represented only by a non-connected handoff contract. There is no device control, token, private host, entity mirror, or live connector.

## Quick start

Prerequisites: Node.js 24 or newer and npm 11 or newer.

```bash
npm ci
npm run verify
npm run build
npm run preview
```

Open `http://127.0.0.1:4173` for the isolated synthetic demo. The **Use an account** control opens the real same-origin account UI; API-backed actions require the self-hosted runtime below rather than Vite preview.

For a self-hosted account/API runtime:

```bash
cp .env.example .env
# Replace placeholders using your secret/configuration mechanism.
set -a && . ./.env && set +a
npm run build
npm start
```

Production requires an exact HTTPS `APP_ORIGIN`. The application intentionally refuses to start with incomplete or non-HTTPS production configuration.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
npm audit --audit-level=high
npm run scan:public
npm run scan:history
```

Browser acceptance covers Chromium and Firefox where their Playwright binaries are available, plus 320-pixel reflow, Axe, reduced motion, forced-colors emulation in Chromium, PWA manifest, full shell-cache byte integrity in Chromium, service-worker offline reload in Firefox, network confinement, and demo persistence. Playwright Chromium's context-wide offline emulation bypasses cached subresources in this environment, so an installed-Chromium physical offline reload remains a documented manual gate rather than a fabricated pass. Physical NVDA, iPhone VoiceOver, true browser UI zoom, and OS high-contrast acceptance also remain manual; scripts are in `docs/accessibility.md`.

## Architecture

React and Vite build the installable client. Fastify supplies the API and serves the built client. Node's built-in SQLite driver owns one disposable/self-hosted database. Zod validates every public payload; Argon2id handles passwords. See:

- `docs/architecture.md`
- `docs/api.md`
- `docs/security-and-privacy.md`
- `docs/offline.md`
- `docs/demo.md`
- `docs/home-assistant-contract.md`
- `docs/migrations.md`

## Explicit boundaries

No AI assistant, finance, payments, retailer ordering, messaging, medication management, emergency logic, cameras, precise location/history, analytics, advertising, OAuth provider, public household realm, Home Assistant control, private infrastructure, or live personal deployment is included.

## Contributing and security

Read `CONTRIBUTING.md`, `AGENTS.md`, and `SECURITY.md`. Report vulnerabilities through GitHub's private vulnerability reporting feature rather than a public issue.

## License

MIT — see `LICENSE`.
