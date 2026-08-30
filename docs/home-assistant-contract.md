# Home Assistant handoff contract (not connected)

Home Assistant remains the sole smart-home authority. This MVP contains no HA host, token, entity registry, service call, webhook, state mirror, discovery, control, or live connector.

A future separately reviewed adapter may accept an explicit user-approved completion event:

```json
{
  "schema": "household-coordinator.handoff.v1",
  "eventId": "uuid",
  "householdAlias": "operator-configured opaque alias",
  "kind": "chore.completed",
  "recordId": "uuid",
  "occurredAt": "RFC3339 UTC timestamp",
  "idempotencyKey": "uuid"
}
```

The adapter must be private, same-realm configured, allowlisted by event kind, idempotent, time-bounded, redacted, and one-way. The public app must never infer device state, duplicate entity state, execute a service, accept arbitrary URLs, or claim delivery without a verified receipt. Failure leaves the household record complete and shows the handoff as not delivered; it must never roll back the household action or retry without bounds.
