# Architecture

## Principle: fully independent services
Each service has its own Maven project, its own Postgres database, its own DTOs and its own deployment. There is no
shared library and no service calls another service's API. Any service can be built, started and tested on its own;
the only coupling is the written contract in [`contracts/CONVENTIONS.md`](../contracts/CONVENTIONS.md).

```
                     Browser
                        |
                 Caddy edge :8080      /internal/** is never routed
        +---------------+---------------+---------------+
        |               |               |               |
   identity :8081  catalog :8082   order :8083    payment :8084      storefront :3000
        |               |               |               |
   identity-db     catalog-db       order-db       payment-db
   (Postgres)      (PostGIS)       (Postgres)      (Postgres)

   catalog --(pull feed)--> order <--(pull feed)-- payment
```

## How services share data without calling each other
1. A service writes an event to its own `outbox` table in the same transaction as the state change.
2. It exposes `GET /internal/events?after=<cursor>`, protected by the `X-Internal-Key` header (constant-time compare; a
   blank key rejects everything).
3. A consumer polls on a schedule, stores its own cursor in `feed_cursor`, and applies events idempotently into a
   local replica table. If the producer is down the consumer logs a warning and retries; it never fails startup.

A message broker can replace this later without changing the business logic, only the transport.

## Authentication
identity-service signs RS256 JWTs. Every other service validates them locally with `JWT_PUBLIC_KEY_PEM`, so none of
them needs identity-service to be running.

## Order and payment flow
1. The storefront creates an order. order-service recomputes all prices in paise from its local menu replica and
   ignores client-sent totals.
2. The storefront asks payment-service to pay `{orderId, amountPaise}` (with an `Idempotency-Key`).
3. payment-service records the payment and emits `PaymentCaptured` / `PaymentFailed`.
4. order-service polls that feed and moves `CREATED -> PAID` only when the captured amount equals the order total.

Order states: `CREATED, PAID, MERCHANT_ACCEPTED, PREPARING, RIDER_ASSIGNED, PICKED_UP, DELIVERED`, plus
`PAYMENT_FAILED, REJECTED_BY_MERCHANT, CANCELLED, REFUNDED`. All transitions live in one state-machine class and each
one writes an order-event row and an outbox event.

Staff access to orders (restaurant owners) is decided from `ownerUserId`, which catalog-service publishes in
`RestaurantUpserted` and order-service stores in its restaurant replica.

## Notifications
notification-service (:8086, own `notification` database) is a pure consumer: it polls the identity, catalog, order,
payment and fleet feeds and turns events into an in-app inbox plus queued email and SMS. It learns a person's verified
phone and email from identity's `UserContactUpdated` event, **encrypted** with a key shared only by those two services,
so no outbox or feed carries a plain contact. Details: [services/notification-service.md](services/notification-service.md).

## Conventions
- Money is `long` paise, IDs are UUIDs, timestamps are UTC ISO-8601, errors are RFC 7807 problem+json.
- All configuration comes from environment variables. Dev-only defaults live in `application-local.yml` (identity) or
  are off by default, so a deployed service fails closed when a secret is missing.

## Code layout
Every Java service uses the same package layers under `in.foodapp.<service>`:

| Package | Role |
|---|---|
| `api` | REST controllers, request/response DTOs, exception handling |
| `service` | use cases and transactional orchestration |
| `domain` | pure business rules and value objects (no Spring/JPA) |
| `persistence` | JPA entities and repositories |
| `events` | outbox writing, feed endpoint, feed consumers |
| `infra` | adapters to external concerns (SMS, JWT signing, crypto, payment gateways) |
| `config` | Spring configuration, security, properties |

The storefront groups code by feature under `storefront/src/features/` (`auth`, `catalog`, `cart`, `orders`), with
`shell/` for the layout pieces and `lib/` for the API client. See `storefront/README.md`.

## Repository map
```
services/      four Spring Boot services (each is a standalone Maven project)
storefront/    Next.js web app
contracts/     cross-service contract documents
deploy/        compose (local), k8s (other clouds), scripts (dev key generation)
docs/          this documentation
.github/       path-filtered CI workflows
```
