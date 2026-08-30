# Offline contract

Offline support begins only after an authorized first load or after the anonymous demo shell is cached.

## Truthful state machine

- `pending`: retained locally and visibly labelled; no server success is implied.
- `syncing`: one transport attempt is active.
- `conflict`: server returned 409; local input remains and the current server version is named for reconciliation.
- `blocked`: authority is unavailable (guest expired, revoked, or rejected); the item is never retried automatically.
- `failed`: server failed safely; input remains and a retry can be initiated.
- success: the exact queued item is removed only after a 2xx response.

Every queued item keeps one UUID idempotency key for its entire lifetime. Duplicate enqueue with the same key does not create a second item. Transport loss retains pending state; it does not fabricate success. Sync is sequential to make conflict order understandable. The account queue uses the dedicated `household-coordinator:account-queue:v1` browser key, validates persisted records, caps storage at 100 operations, labels every item with both its household realm and authenticated user, requires that active realm/user pair for every flush, and never stores session cookies, CSRF tokens, passwords, or opaque guest credentials.

## Guest safety

Guest queue metadata includes grant expiry and a revocation flag but not the opaque credential. Before any network call, `flush` blocks work when the grant is revoked or when current time is equal to or later than expiry. A server 401/403 also blocks the entry. There is no background retry after authority loss.

## Cache boundary

The service worker handles same-origin GET shell/assets only. It never caches or intercepts `/api/`, never caches writes, and never broadens to a different origin. Version upgrades delete retired shell caches during activation. The synthetic demo remains a separate labelled browser-only store.

## Conflict recovery

The UI must present the local attempted change and current server version, preserve the user's input, and offer explicit discard or retry-on-current-version choices. It must not auto-merge or silently overwrite.
