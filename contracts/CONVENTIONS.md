# Cross-service conventions

Services are **fully independent**: separate Maven project, separate database, no shared library, no service
calls another service's API. The only coupling is the contracts below (documents, not code). Each consumer writes
its own DTOs.

## Ports (container and local)
| Service | Port | Base path via edge (Caddy :8080) |
|---|---|---|
| identity-service | 8081 | `/api/identity/*` -> `/` |
| catalog-service | 8082 | `/api/catalog/*` -> `/` |
| order-service | 8083 | `/api/orders/*` -> `/` |
| payment-service | 8084 | `/api/payments/*` -> `/` |
| fleet-service | 8085 | `/api/fleet/*` -> `/` |
| storefront | 3000 | `/` |

The edge strips the `/api/<svc>` prefix, so inside each service paths are `/auth/...`, `/restaurants`, `/orders`,
`/payments`. `/internal/**` is never routed by the edge.

## Java stack
Java 21, Spring Boot 3.3.x, Maven, base package `in.foodapp.<service>` (e.g. `in.foodapp.catalog`) with the same
layers in every service (`api`, `service`, `domain`, `persistence`, `events`, `infra`, `config`; see
`docs/architecture.md`), Flyway
(`src/main/resources/db/migration`), Spring Data JPA, springdoc-openapi, actuator (`/actuator/health`),
Testcontainers for integration tests. No `mvnw` required: Dockerfile builds with the `maven:3.9-eclipse-temurin-21`
image. Money is always `long` **paise** (INR x 100). IDs are UUIDs. Timestamps are UTC ISO-8601.
All configuration comes from environment variables (12-factor), with local-dev defaults in `application.yml`.
Errors use RFC 7807 `application/problem+json`.

## Auth (JWT, validated locally by every service)
- identity-service signs **RS256** access tokens, 15 min expiry. Claims: `iss="identity-service"`, `sub=<userId UUID>`,
  `roles=["CUSTOMER"]` (also `"RESTAURANT"`, `"ADMIN"` later), `iat`, `exp`.
- Other services verify with the public key from env `JWT_PUBLIC_KEY_PEM` (PEM text, `\n` allowed as literal escape).
  They never call identity-service. Use Spring Security resource server with a locally built `JwtDecoder`
  (`NimbusJwtDecoder.withPublicKey`). identity-service uses `JWT_PRIVATE_KEY_PEM` (PKCS8) and `JWT_PUBLIC_KEY_PEM`.
- Customer-owned resources: always check `sub` equals the owner, else HTTP 403.

## Event feed (Postgres outbox + pull)
Each service writes events to its own `outbox` table **in the same transaction** as the state change:
`outbox(id BIGSERIAL PK, type TEXT, aggregate_id UUID, payload JSONB, occurred_at TIMESTAMPTZ DEFAULT now())`.

Feed endpoint (producers: identity, catalog, order, payment), guarded by header `X-Internal-Key` equal to env
`INTERNAL_FEED_KEY` (constant-time compare; 401 otherwise):

```
GET /internal/events?after={cursor:long, default 0}&limit={1..500, default 100}
200 {
  "events": [ { "id": 12, "type": "MenuItemUpserted", "aggregateId": "<uuid>",
                "occurredAt": "2026-01-01T10:00:00Z", "payload": { ... } } ],
  "nextCursor": 12            // id of last event returned, or `after` if none
}
```
Events are returned ordered by `id` ascending, only those with `id > after`. (Outbox ids are assigned at insert; a
writer that commits out of order could expose a gap, so producers must serialize inserts with
`pg_advisory_xact_lock(<constant>)` before inserting.)

Consumers poll (`@Scheduled`, default every 2 s, env `<PRODUCER>_FEED_URL`, `<PRODUCER>_FEED_KEY`), persist their own
cursor in table `feed_cursor(source TEXT PK, last_id BIGINT)`, and apply events **idempotently** (upsert by
aggregate id; ignore stale events). If the producer is down, log at WARN and retry next tick: never fail startup.

**Failing events never block the feed.** A batch is applied in one transaction; if it fails, the consumer re-applies
the events one at a time. A failing event is retried on later polls (`FEED_MAX_ATTEMPTS`, default 5, counted in
`feed_failure`); after that, or at once for a malformed payload, it is parked in `feed_dead_letter` (payload and
error kept) and the cursor moves on. Handlers throw on malformed events instead of skipping them. An ADMIN lists parked
events with `GET /admin/dead-letters` (order-service) or `GET /fleet/admin/dead-letters` (fleet-service) and calls
`POST .../{id}/retry` (re-applies it; stays parked with the error if it still fails) or `POST .../{id}/discard`.

### Event payloads (all fields required unless noted)
The machine-checked definition of every event is in [`events/`](events/README.md) (JSON Schema, one file per event,
with producer, consumers and a golden example); the list below is a summary. Producers and consumers are tested
against those files.
catalog-service:
- `RestaurantUpserted` `{restaurantId, name, lat, lng, open, deliveryRadiusMeters, kitchenCertificationLevel, fssaiNumber, ownerUserId (nullable UUID; the restaurant owner's user id = JWT `sub`)}`
- `MenuItemUpserted` `{itemId, restaurantId, name, pricePaise, isPureVeg, isVegan, isJain, available}`
- `MenuItemAvailabilityChanged` `{itemId, restaurantId, available}`

order-service:
- `OrderCreated` `{orderId, customerId, restaurantId, totalPaise}`
- `OrderStatusChanged` `{orderId, customerId, restaurantId, from, to, totalPaise}`

payment-service:
- `PaymentCaptured` `{paymentId, orderId, amountPaise, gatewayRef}`
- `PaymentFailed` `{paymentId, orderId, reason}`
- `RefundIssued` `{refundId, paymentId, orderId, amountPaise}`

fleet-service:
- `DeliveryAssigned` `{orderId, partnerId, assignedBy}` (order-service moves PREPARING -> RIDER_ASSIGNED)
  `OrderStatusChanged` also carries `orderNumber` and `restaurantName` so fleet can build its job list.

identity-service:
- `UserRegistered` `{userId}`
- `UserDeleted` `{userId}`

## Order and payment flow (no service-to-service calls)
1. Storefront `POST /api/orders/orders` (cart lines: itemId + quantity only) -> order-service recomputes prices from
   its local menu replica, returns `{id, totalPaise, status:"CREATED"}`.
2. Storefront `POST /api/payments/payments` with header `Idempotency-Key` and body `{orderId, amountPaise}` -> payment-service
   creates a payment with the configured gateway (fake by default; fake auto-captures) and emits `PaymentCaptured`.
3. order-service polls payment-service feed; on `PaymentCaptured` it moves CREATED -> PAID **only if**
   `amountPaise == order.totalPaise`; otherwise it records an `AMOUNT_MISMATCH` order event and stays CREATED.
   On `PaymentFailed` -> `PAYMENT_FAILED`.

## Environment variable names
Common: `SERVER_PORT`, `DB_URL` (jdbc), `DB_USER`, `DB_PASSWORD`, `INTERNAL_FEED_KEY`, `JWT_PUBLIC_KEY_PEM`.
identity: `JWT_PRIVATE_KEY_PEM`, `PII_ENC_KEY` (base64 32 bytes), `PII_HMAC_KEY` (base64 32 bytes), `SMS_PROVIDER` (`logging`).
order: `CATALOG_FEED_URL`, `CATALOG_FEED_KEY`, `PAYMENT_FEED_URL`, `PAYMENT_FEED_KEY`, `FEED_POLL_MS` (2000),
  `DELIVERY_FEE_PAISE` (3000), `GST_PERCENT` (5).
payment: `GATEWAY` (`fake`|`razorpay`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
Each service Postgres: database/user/password `<svc>` (e.g. `catalog`), image `postgis/postgis:16-3.4` for catalog,
`postgres:16` for the others.
