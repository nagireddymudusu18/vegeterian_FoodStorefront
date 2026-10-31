# payment-service (port 8084) - skeleton

Payment creation behind a gateway port, webhook handling and an append-only double-entry ledger. No live gateway yet
(merchant account pending).

| | |
|---|---|
| Database | `payment` (Postgres 16) |
| Publishes (feed) | `PaymentCaptured`, `PaymentFailed`, `RefundIssued` |
| Consumes | order-service feed: `OrderStatusChanged` to `CANCELLED` / `REJECTED_BY_MERCHANT` refunds the order's captured payment |
| Key env | `GATEWAY` (`fake` or `razorpay`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `JWT_PUBLIC_KEY_PEM`, `INTERNAL_FEED_KEY`, `ORDER_FEED_URL`, `ORDER_FEED_KEY` |

`FakeGateway` auto-captures and fails when the amount in paise ends in 13. `RazorpayGateway` verifies webhook HMACs
for real; every other call throws "pending merchant approval". Payment creation requires an `Idempotency-Key`; webhooks
are deduplicated on the gateway event id. When an order is cancelled or rejected the captured amount is refunded
automatically (idempotency key `auto:<paymentId>`); a payment captured after its order closed is refunded at once.

Packages: `api`, `service`, `domain`, `persistence`, `events`, `infra.gateway`, `config`. Full detail:
[`services/payment-service/README.md`](../../services/payment-service/README.md).
