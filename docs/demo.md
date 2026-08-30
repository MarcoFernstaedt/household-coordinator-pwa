# Synthetic demo

The default portfolio surface is a deterministic, anonymous, no-account demo.

- Household: `Sunbeam House (Demo)`
- Pet: `Pixel`, a fictional dog
- Storage: one key, `household-coordinator:synthetic-demo:v1`
- Network: zero API writes and zero analytics
- Reset: removes the demo key, recreates the exact seed, and announces completion in the single polite live region

The demo adapter accepts an explicit storage implementation in tests. This proves isolation without relying on global browser state and makes corruption recovery deterministic. It has no session, CSRF, guest token, household identifier, API client, or code path into a real realm.

Browser acceptance records every page request and requires GET/HEAD only, no `/api/` requests, same-origin assets, and no console/page errors. Offline reload must retain browser-only changes after the service worker controls the page.
