# API contract

All account routes are same-origin JSON under `/api`. Writes require the HttpOnly `household_session` cookie, an exact allowlisted `Origin`, `X-CSRF-Token`, and—where replayable—`Idempotency-Key` containing a UUID. Errors use `{ "error": "stable_code", "message": "safe recovery" }` and never reveal foreign record existence.

## Authentication and membership

- `POST /api/setup` — create a household and first owner; returns a CSRF token and sets the session cookie.
- `POST /api/auth/login` — generic credential failure, bounded to five attempts per 15 minutes per limiter key.
- `POST /api/auth/logout` — revokes the current server-side session and clears its cookie.
- `GET /api/workspace` — authenticated, realm-confined projection for the account UI: current user/household, household members, chores, groceries, pets, and routines.
- `POST /api/members` — owner creates a member in the current household.

Passwords are 14–128 characters and are hashed with Argon2id. Sessions expire after eight hours.

## Chores

- `POST /api/chores` — create, optionally assign to a same-household user.
- `GET /api/chores/:id` — realm-confined lookup.
- `PATCH /api/chores/:id` — `complete` or `reopen` with `expectedVersion`.

Members may update chores assigned to them; owners may update any chore in their household.

## Groceries

- `POST /api/groceries` — add bounded name, quantity, and note.
- `GET /api/groceries` — current household list.
- `PATCH /api/groceries/:id` — check/uncheck with `expectedVersion`.
- `DELETE /api/groceries/completed` — clear completed for the authorized owner/member household.

## Pet care

- `POST /api/pets` — create generic pet profile.
- `POST /api/pets/:petId/routines` — feeding, walk, or medication-note routine.
- `POST /api/pet-routines/:id/completions` — versioned completion with a bounded handoff note.

Medication-note is a routine record label only and every response states: `Routine record only — not medical advice.`

## Guest grants

- `POST /api/guests` — owner creates a future-expiring grant and receives the opaque credential exactly once.
- `DELETE /api/guests/:id` — owner revokes immediately.
- `GET /api/guest/groceries` — requires `Authorization: Guest <opaque>` plus `groceries:read`.

Allowed scopes are closed: `chores:read`, `groceries:read`, `groceries:check`, and `pet-care:read`. Unknown or unimplemented scopes fail closed. Expired, revoked, unknown, and cross-realm credentials return the same generic unavailable result.

## Health

`GET /api/health` returns `{ "status": "ok" }`. It does not expose configuration, dependencies, database location, or user counts.
