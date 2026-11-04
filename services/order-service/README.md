# order-service

Order management for the India food-delivery marketplace. Spring Boot 3.3 / Java 21 / Postgres 16, port **8083**
(edge route `/api/orders/*` -> `/`).

> **Status:** compiles, and the unit tests pass (`OrderStateMachineTest`, `PricingServiceTest`,
> `OrderServiceStaffAuthTest`). The Testcontainers integration tests compile but have not been run (they need Docker).

## Purpose

- Creates orders from a cart (`restaurantId` + `itemId`/`quantity` only) and prices them **server-side** from a
  local replica of the catalog (restaurant and menu data fed by catalog-service events). Client totals are ignored.
- Owns the order state machine; every transition writes an `order_events` row and an `OrderStatusChanged` outbox event
  in the same transaction (outbox inserts serialised with `pg_advisory_xact_lock(8083001)`).
- Fully independent: no synchronous calls to other services, no shared library. It only *polls* the catalog and
  payment `/internal/events` feeds over HTTP and exposes its own feed for others.

## Package layout

Base package `in.foodapp.order`:

| Package | Role |
|---|---|
| `api` | controllers, DTOs, exception handling |
| `service` | order creation, pricing, transitions, staff authorization (`OrderService.loadForStaff`) |
| `domain` | `OrderStatus`, `OrderStateMachine`, `IllegalTransitionException` |
| `persistence` | entities (orders, menu/restaurant replicas), repositories, `FeedCursorStore` |
| `events.outbox` | outbox writer |
| `events.feed` | `/internal/events` producer endpoint |
| `events.consumer` | catalog and payment pollers and event handlers |
| `events.stream` | `OrderStreamHub`: server-sent-event connections, fed by an after-commit `OrderStatusChangedEvent` |
| `config` | properties and security |

## Endpoints

All need a JWT (RS256, `iss=identity-service`, `roles` claim) unless noted. Errors are `application/problem+json`.

| Method / path | Role | Notes |
|---|---|---|
| `POST /orders` | CUSTOMER | Body `{restaurantId, lines:[{itemId, quantity 1..20}]}`. Optional `Idempotency-Key` header (unique per customer): replay returns the same order with 200 (first call 201). 409 for unavailable items (`itemIds` in body) or a closed restaurant. |
| `GET /orders/{id}` | CUSTOMER (owner) / ADMIN | 403 if not owner. `deliveryOtp` appears only for the owner while status is `PICKED_UP`. |
| `GET /orders/{id}/stream` | CUSTOMER (owner) / ADMIN | `text/event-stream`. Ownership checked on connect; sends `event: status` with `{"status":"..."}` (initial value, then every committed transition) and a `: ping` comment every 25 s. Order data is never pushed: clients refetch `GET /orders/{id}`. Max 5 streams per order, 5000 per instance (else 429). State is per instance, so clients keep a slow poll. Behind a proxy, disable response buffering (Caddy: `flush_interval -1`). |
| `GET /orders/restaurant?history=` | RESTAURANT (own restaurants) / ADMIN (all) | Kitchen board: active orders (or history), newest first, max 100. Items and status only; no customer identity or delivery OTP. |
| `GET /orders/restaurant/stream` | RESTAURANT / ADMIN | `text/event-stream` of data-less `event: changed` after a committed transition of one of the caller's orders (admin: all); clients refetch the board. Max 5 per user, 2000 per instance; 25 s ping. |
| `GET /orders` | CUSTOMER | My orders, newest first. |
| `POST /orders/{id}/cancel` | CUSTOMER (owner) | Allowed in CREATED, PAID, MERCHANT_ACCEPTED, PREPARING; else 409. |
| `POST /orders/{id}/accept` `/reject` `/preparing` `/rider-assigned` `/picked-up` | RESTAURANT (owner of the order's restaurant) / ADMIN | 403 for other restaurants' staff, see Security below. `/reject` accepts optional `{reason}`. `/picked-up` generates the 4-digit OTP. |
| `POST /orders/{id}/deliver` `{otp}` | RESTAURANT (owner) / ADMIN | Same ownership check. Verifies OTP; max 5 wrong attempts per order (then 429). |
| `GET /internal/events?after=&limit=` | none (JWT not needed) | Feed per CONVENTIONS; requires header `X-Internal-Key` = `INTERNAL_FEED_KEY` (401 otherwise). Not routed by the edge. |
| `GET /actuator/health`, `/swagger-ui.html`, `/v3/api-docs` | none | |

Illegal transitions return 409.

### Security: per-restaurant staff authorization

The staff endpoints (`accept`, `reject`, `preparing`, `rider-assigned`, `picked-up`, `deliver`) are authorized in one
place, `OrderService.loadForStaff`. The JWT carries no restaurant id, so ownership comes from the local
`restaurant_replica.owner_user_id` (migration `V4`, fed by `ownerUserId` in catalog `RestaurantUpserted`):

- `ADMIN`: allowed on any order.
- `RESTAURANT`: allowed only if the order's restaurant replica `owner_user_id` equals the JWT `sub`; otherwise 403.
  A restaurant whose replica has a null owner (never received an event carrying `ownerUserId`) or is not replicated
  is denied for every RESTAURANT user (ADMIN only) until a newer `RestaurantUpserted` arrives.
- Unknown order: 404; order of someone else's restaurant: 403 (same as the customer endpoints).
- Older events without `ownerUserId` are tolerated (the known owner is kept; an explicit `null` clears it).

### Delivery OTP storage (design choice)

The OTP is stored **in clear** in `orders.delivery_otp` (not hashed), because it must be shown to the customer while the
order is `PICKED_UP`. A hash of a 4-digit number is trivially brute-forced anyway; the real protection is the attempt
limit (`otp_attempts`, max 5, persisted even when the attempt fails). It is cleared on `DELIVERED` and never returned to
staff or admin responses.

## State machine

```
CREATED --> PAID --> MERCHANT_ACCEPTED --> PREPARING --> RIDER_ASSIGNED --> PICKED_UP --> DELIVERED
   |         |  \            |                 |
   |         |   \           +-----------------+--> CANCELLED (customer, before RIDER_ASSIGNED)
   |         |    +--> REJECTED_BY_MERCHANT --> REFUNDED
   |         +--------> CANCELLED --(only if it had been PAID)--> REFUNDED
   +--> PAYMENT_FAILED
   +--> CANCELLED
```

Table (single source: `OrderStateMachine`): CREATED -> PAID | PAYMENT_FAILED | CANCELLED; PAID -> MERCHANT_ACCEPTED |
REJECTED_BY_MERCHANT | CANCELLED; MERCHANT_ACCEPTED -> PREPARING | CANCELLED; PREPARING -> RIDER_ASSIGNED | CANCELLED;
RIDER_ASSIGNED -> PICKED_UP; PICKED_UP -> DELIVERED; REJECTED_BY_MERCHANT -> REFUNDED; CANCELLED -> REFUNDED (only when
`was_paid`).

## Feed consumers

`CatalogFeedPoller` and `PaymentFeedPoller` run every `FEED_POLL_MS` (default 2000). Each batch (events + `feed_cursor`
advance) is one DB transaction. Producer down -> WARN and retry next tick; startup never fails. A blank feed key disables
that poller (one INFO log).

**Failing events (migration V7).** If a batch fails, its events are re-applied one at a time. A failing event is retried
on later polls (`FEED_MAX_ATTEMPTS`, default 5, counted in `feed_failure`); after that, or at once when the payload is
malformed (`MalformedEventException`), it is parked in `feed_dead_letter` and the cursor moves on, so one bad event never
blocks the feed. ADMIN endpoints: `GET /admin/dead-letters`, `POST /admin/dead-letters/{id}/retry` (re-applies it; stays
parked with the error if it still fails) and `POST /admin/dead-letters/{id}/discard`. Parking is logged at ERROR.

- Catalog: `RestaurantUpserted`, `MenuItemUpserted`, `MenuItemAvailabilityChanged` upsert the replicas; events whose id
  is not newer than the row's `source_event_id` are ignored; unknown types ignored.
- Payment: `PaymentCaptured` (CREATED -> PAID only if `amountPaise == totalPaise`, else an `AMOUNT_MISMATCH`
  `order_events` row and the order stays CREATED), `PaymentFailed` (CREATED -> PAYMENT_FAILED), `RefundIssued`
  (paid CANCELLED / REJECTED_BY_MERCHANT -> REFUNDED). Orders already past that state are left alone.

## Environment variables

| Variable | Default | |
|---|---|---|
| `SERVER_PORT` | 8083 | |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/order` / `order` / `order` | |
| `JWT_PUBLIC_KEY_PEM` | empty (all authenticated calls rejected) | PEM public key; literal `\n` allowed |
| `INTERNAL_FEED_KEY` | `dev-internal-key` | guards `/internal/events` |
| `CATALOG_FEED_URL` / `CATALOG_FEED_KEY` | `http://localhost:8082` / empty (polling off) | |
| `PAYMENT_FEED_URL` / `PAYMENT_FEED_KEY` | `http://localhost:8084` / empty (polling off) | |
| `FEED_POLL_MS` | 2000 | |
| `FEED_MAX_ATTEMPTS` | 5 | attempts before a failing feed event is parked in `feed_dead_letter` |
| `GST_PERCENT` | 5 | applied to subtotal, rounded half-up to paise |
| `DELIVERY_FEE_PAISE` | 3000 | |
| `JAVA_OPTS` (container) | `-XX:MaxRAMPercentage=70` | |

## Run

```
# local Postgres: database/user/password "order"
docker run -d --name order-db -e POSTGRES_DB=order -e POSTGRES_USER=order -e POSTGRES_PASSWORD=order -p 5432:5432 postgres:16
mvn spring-boot:run

# or container
docker build -t order-service .
docker run --rm -p 8083:8083 -e DB_URL=jdbc:postgresql://host.docker.internal:5432/order \
  -e JWT_PUBLIC_KEY_PEM="$(cat identity-public.pem)" -e INTERNAL_FEED_KEY=secret \
  -e CATALOG_FEED_KEY=<catalog key> -e PAYMENT_FEED_KEY=<payment key> order-service
```

Tests: `mvn test` (unit tests need nothing; integration tests start `postgres:16` through Testcontainers, so Docker
is required). Money is always `long` paise.
