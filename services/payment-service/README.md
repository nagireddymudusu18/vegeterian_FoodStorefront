# payment-service

Payments, double-entry ledger and refunds for the India food-delivery marketplace. Port **8084**
(edge path `/api/payments/*`, prefix stripped). Package `in.foodapp.payment`. Java 21, Spring Boot 3.3, Postgres 16.

> **Status: untested.** Java, Maven and Docker were not installed on the machine where this skeleton was written,
> so it has **never been compiled, run or tested**. Expect to fix small compile/wiring errors on first build
> (`mvn -q test` needs Docker for the Testcontainers tests).

The merchant account is not approved yet, so there are **no live gateway calls**. `GATEWAY=fake` (default) runs the
whole order flow locally; `GATEWAY=razorpay` is a stub whose API calls throw
`UnsupportedOperationException("pending merchant approval")` (webhook signature verification is real).

## Endpoints

| Method / path | Auth | Notes |
|---|---|---|
| `POST /payments` | JWT, role `CUSTOMER` | Header `Idempotency-Key` required (1-128 chars). Body `{orderId, amountPaise}`, `0 < amountPaise <= 5,000,000`. `customer_id = sub`. 201 on first call, 200 on replay of the same key+body, **422** if the key is reused with a different body. Fake gateway captures in the same transaction: ledger entries + outbox `PaymentCaptured`; on gateway failure the payment is `FAILED` + outbox `PaymentFailed`. |
| `GET /payments/{id}` | JWT, owner or `ADMIN` | else 403 |
| `POST /payments/{id}/refund` | JWT, role `ADMIN` | Header `Idempotency-Key`, body `{amountPaise}`. Cannot exceed captured minus already refunded (422). Emits `RefundIssued`. Payment becomes `REFUNDED` when fully refunded. |
| `POST /webhooks/razorpay` | none (HMAC) | Raw body; `X-Razorpay-Signature` (hex HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`) -> 401 if bad; `X-Razorpay-Event-Id` deduped via unique `webhook_events.gateway_event_id` (duplicate -> 200 `DUPLICATE`, no state change, no ledger posting). Maps `payment.captured`, `payment.failed`, `refund.processed` onto the same domain operations as the REST API. |
| `GET /internal/events?after=&limit=` | `X-Internal-Key` = `INTERNAL_FEED_KEY` | Outbox feed exactly per `contracts/CONVENTIONS.md` (401 otherwise; not routed by the edge). |
| `GET /actuator/health`, `/swagger-ui.html`, `/v3/api-docs` | none | |

Errors are RFC 7807 `application/problem+json`. Money is `long` paise.

### Fake gateway behaviour
* Captures immediately, reference `fake_pay_<uuid>`.
* **Fails when `amountPaise % 100 == 13`** (amount ends in 13, e.g. 1013, 50013): deterministic way to test `PaymentFailed`.
* Webhook signatures use the same HMAC scheme and `RAZORPAY_WEBHOOK_SECRET`, so you can exercise `/webhooks/razorpay` locally.

### Events (outbox, same transaction as the state change)
`PaymentCaptured {paymentId, orderId, amountPaise, gatewayRef}`, `PaymentFailed {paymentId, orderId, reason}`,
`RefundIssued {refundId, paymentId, orderId, amountPaise}`. Outbox inserts take `pg_advisory_xact_lock(84004001)` first.

### Ledger
`ledger_entries` is append-only (trigger raises on UPDATE/DELETE/TRUNCATE). Capture posts one `txn_id`:
debit `GATEWAY_CLEARING` / credit `CUSTOMER_PAYABLE_ESCROW`; refund is the reverse. Balance is checked in
`LedgerService.assertBalanced` and again by a deferred constraint trigger (debits == credits per `txn_id` at commit).

## Package layout

Base package `in.foodapp.payment` (`PaymentServiceApplication` lives in the root).

| Package | Role |
|---|---|
| `api` | REST controllers, request/response DTOs, `ApiException` and the problem+json `@RestControllerAdvice` |
| `service` | Use cases: `PaymentService`, `WebhookService`, `LedgerService`, `Idempotency` helpers |
| `domain` | Framework-free enums (`PaymentStatus`, `RefundStatus`) |
| `persistence` | JPA entities (`Payment`, `Refund`) and Spring Data repositories |
| `events` | Outbox writer (`OutboxService`) and the `/internal/events` feed controller |
| `infra.gateway` | `PaymentGateway` port, gateway DTOs, `FakeGateway`, `RazorpayGateway`, `WebhookSignatures` |
| `config` | Spring configuration (`SecurityConfig`) |

## Environment variables

| Var | Default | |
|---|---|---|
| `SERVER_PORT` | 8084 | |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/payment` / `payment` / `payment` | |
| `INTERNAL_FEED_KEY` | `dev-internal-key` | feed key (change outside local dev) |
| `JWT_PUBLIC_KEY_PEM` | *(none, required)* | identity-service RS256 public key; literal `\n` allowed. Startup fails fast if missing. |
| `GATEWAY` | `fake` | `fake` or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | empty | webhook secret also used by the fake gateway |
| `JAVA_OPTS` (container) | `-XX:MaxRAMPercentage=70` | |

Run: `docker build -t payment-service .` then `docker run -p 8084:8084 -e JWT_PUBLIC_KEY_PEM=... -e DB_URL=... payment-service`.

## Go-live checklist (Razorpay) and TODO notes

No code exists for any of the following yet; all of it is pending merchant approval.

1. Implement `RazorpayGateway.createOrder` (`POST /v1/orders`, amount in paise, `receipt` = our payment id, put our `payment_id` in `notes` so webhooks resolve it), checkout signature verification (`order_id|payment_id`), capture, and `createRefund` (`POST /v1/payments/{id}/refund`). Make `createPayment` return `GatewayPayment.pending(orderId)`; capture then arrives via checkout verification or the `payment.captured` webhook (already wired).
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; configure the webhook URL in the Razorpay dashboard (events: `payment.captured`, `payment.failed`, `refund.processed`) pointing at a publicly reachable `/api/payments/webhooks/razorpay` (the edge must route it without JWT and pass the raw body and headers untouched).
3. Run against Razorpay test mode end to end; replay and tamper webhooks; confirm dedupe on `X-Razorpay-Event-Id`.
4. Rotate `INTERNAL_FEED_KEY`; keep `/internal/**` off the public edge.
5. **UPI Intent**: add UPI intent/collect flows for mobile (deep link `upi://pay?...`), with VPA validation and payment-pending polling/expiry handling.
6. **Card-on-file tokenisation (RBI)**: RBI forbids merchants storing card numbers; use gateway tokenisation (network tokens), never persist PAN/CVV, store only the token reference and last4/network, and obtain explicit customer consent plus AFA for the first token transaction. Recurring/e-mandate rules apply to saved-card auto-debits.
7. **Route split payouts**: Razorpay Route linked accounts for restaurants, splitting each captured payment into platform commission, delivery fee and restaurant net, with T+1 settlement and holds on refund/dispute. Extend the ledger with per-party accounts (restaurant payable, platform revenue, delivery payable) so every transfer is a balanced posting.
8. **Instant refunds**: use `speed=optimum` on refunds and reflect `refund.processed` / `refund.failed`; handle partial refunds against split transfers (reverse transfers).
9. Reconciliation: daily settlement report vs `ledger_entries` of `GATEWAY_CLEARING`; alert on mismatch.
10. Enforce amount consistency: order-service already only moves an order to PAID if `amountPaise == order.totalPaise`.

## Tests

* Unit: `LedgerServiceTest` (balance), `RazorpayGatewayTest` (signature vectors computed in the test + RFC 4231), `FakeGatewayTest`, `IdempotencyTest`.
* Testcontainers (`postgres:16`, needs Docker): `PaymentApiTest` (idempotent POST, 422, validation, failure path, ownership, refunds), `WebhookTest` (dedupe -> one ledger txn, bad signature 401, event mapping), `LedgerTriggerTest` (UPDATE/DELETE and unbalanced txn rejected), `FeedTest` (pagination, key rejection).

All of these are unrun (see status above).
