# payment-service (port 8084) - skeleton

Payment creation behind a gateway port, webhook handling and an append-only double-entry ledger. No live gateway yet
(merchant account pending).

| | |
|---|---|
| Database | `payment` (Postgres 16) |
| Publishes (feed) | `PaymentCaptured`, `PaymentFailed`, `RefundIssued` |
| Consumes | nothing (it stores the `orderId` and amount it is given) |
| Key env | `GATEWAY` (`fake` or `razorpay`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `JWT_PUBLIC_KEY_PEM`, `INTERNAL_FEED_KEY` |

`FakeGateway` auto-captures and fails when the amount in paise ends in 13. `RazorpayGateway` verifies webhook HMACs
for real; every other call throws "pending merchant approval". Payment creation requires an `Idempotency-Key`; webhooks
are deduplicated on the gateway event id.

Packages: `api`, `service`, `domain`, `persistence`, `events`, `infra.gateway`, `config`. Full detail:
[`services/payment-service/README.md`](../../services/payment-service/README.md).
