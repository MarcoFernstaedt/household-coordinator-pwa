# Contributing

Thank you for improving Household Coordinator.

1. Read `AGENTS.md`, `CLAUDE.md`, and the domain/security/offline contracts under `docs/`.
2. Use a focused branch and one writer per worktree.
3. Keep the MVP boundary: no live integrations, private data, analytics, AI, finance, messaging, medical management, emergency behavior, precise location, camera, or smart-home control.
4. Use vertical RED → GREEN → REFACTOR TDD. Every behavior change needs a focused test that fails for the intended reason before production code.
5. Run `npm run verify` and `npm run test:e2e`. Browser or physical assistive-technology limitations must be stated honestly.
6. Do not commit `.env`, databases, logs, browser profiles, credentials, generated reports, or private fixtures.
7. Keep pull requests small, explain threat/accessibility impact, and list exact verification commands.

## Commit quality

Use a concise imperative subject. Keep unrelated changes separate. Generated dependency changes require lockfile review and `npm audit --audit-level=high`.

## Accessibility

Use native semantic elements, labelled controls, logical headings and landmarks, visible focus, keyboard completion, one restrained live region, and non-color state cues. Cover loading, empty, offline, pending, conflict, expired, revoked, forbidden, error, and success recovery states.

## Security

Realm authorization belongs in every server query. Never trust a client-provided household or role. New guest scopes require a closed enum, negative tests, expiry/revocation behavior, and documentation. Never add arbitrary URL, file, command, template, proxy, upload, or provider callback surfaces casually.
