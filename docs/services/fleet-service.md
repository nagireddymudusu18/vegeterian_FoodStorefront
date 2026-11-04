# fleet-service (port 8085)

Delivery partners and the delivery pool. Own database (`fleet`), own outbox, no calls to other services.

## Flow
1. order-service emits `OrderStatusChanged`; fleet mirrors it. `PREPARING` creates an `AVAILABLE` job; `PICKED_UP`,
   `DELIVERED` and cancel/reject/refund advance or close it.
2. A partner accepts from the pool (`POST /fleet/deliveries/{orderId}/accept`) or an admin assigns
   (`POST /fleet/admin/deliveries/{orderId}/assign`). Either way fleet emits `DeliveryAssigned`.
3. order-service consumes it and moves `PREPARING` -> `RIDER_ASSIGNED` (ignored if the order moved on, e.g. cancelled).
4. The partner calls order-service directly: `POST /orders/{id}/rider/picked-up` and `/rider/deliver` (customer OTP,
   5 attempts). The customer's live stream updates because order-service owns the status.

## Endpoints (`PARTNER` role unless noted)
`POST /fleet/partners/me`, `GET /fleet/me`, `PUT /fleet/me/online`, `GET /fleet/me/deliveries`, `GET /fleet/pool`,
`POST /fleet/deliveries/{orderId}/accept`; `ADMIN`: `GET /fleet/admin/deliveries`, `GET /fleet/admin/partners`,
`POST /fleet/admin/deliveries/{orderId}/assign`.

Accepting takes a row lock on the partner and claims the job with a conditional update, so two partners cannot win
the same order (loser gets 409). `app.max-active-deliveries` (default 2) caps active jobs per partner.

## Live updates
`GET /fleet/stream` (PARTNER) and `GET /fleet/admin/stream` (ADMIN) are server-sent-event streams. After any committed
change to the pool, a delivery or a partner, a `changed` event is pushed (no data); the screens then re-read through
the normal authorized endpoints. State is per instance, so the screens keep a slow refresh as a fallback.

## Becoming a partner
`POST /me/partner` on identity-service (needs the `delivery_module` flag on and a verified phone) adds the `PARTNER`
role; the client must refresh its token to see it.

## Known limitation
No unassign/release: a partner who abandons an `ASSIGNED` job needs an admin to handle it manually for now.

## Failing feed events
Same rules as order-service (see `contracts/CONVENTIONS.md`, migration V2): a batch that fails is re-applied one event
at a time; a failing event is retried (`FEED_MAX_ATTEMPTS`, default 5) and then, like a malformed one at once, parked in
`feed_dead_letter` so the feed keeps moving. `ADMIN`: `GET /fleet/admin/dead-letters`,
`POST /fleet/admin/dead-letters/{id}/retry` and `/discard`.

## Config
`ORDER_FEED_URL`, `ORDER_FEED_KEY` (order-service feed), `INTERNAL_FEED_KEY` (this service's feed), `FEED_MAX_ATTEMPTS`,
plus the common variables. Tests: `mvn verify` (use `TEST_DB_URL` to run without Docker).