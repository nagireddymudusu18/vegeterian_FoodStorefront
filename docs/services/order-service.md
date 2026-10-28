# order-service (port 8083)

Orders, server-side pricing, the order state machine and staff authorization.

| | |
|---|---|
| Database | `order` (Postgres 16) |
| Publishes (feed) | `OrderCreated`, `OrderStatusChanged` |
| Consumes (polls) | catalog feed (restaurant and menu replicas), payment feed (`PaymentCaptured`, `PaymentFailed`, `RefundIssued`) |
| Key env | `JWT_PUBLIC_KEY_PEM`, `INTERNAL_FEED_KEY`, `CATALOG_FEED_URL/KEY`, `PAYMENT_FEED_URL/KEY`, `FEED_POLL_MS`, `GST_PERCENT`, `DELIVERY_FEE_PAISE` |

Prices are recomputed from the local menu replica; client totals are ignored. All state changes go through
`OrderStateMachine`, and each writes an `order_events` row plus an outbox event. Restaurant staff may act only on orders
of restaurants they own (`restaurant_replica.owner_user_id` equals the JWT `sub`); ADMIN may act on any.

Packages: `api`, `service`, `domain`, `persistence`, `events.{outbox,feed,consumer,stream}`, `config`. Full detail:
[`services/order-service/README.md`](../../services/order-service/README.md).
