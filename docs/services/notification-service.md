# notification-service (port 8086)

In-app inbox plus email and SMS for orders. Own database (`notification`), no outbox of its own, no calls to other
services: it only **consumes** feeds from identity, catalog, order, payment and fleet.

## Who is told what
| Event (source) | Who | Inbox | Email | SMS |
|---|---|---|---|---|
| `OrderCreated` (order) | customer | yes | | |
| `OrderStatusChanged` to `PAID` | customer | yes | yes | |
| same, `PAID` | restaurant owner (from `RestaurantUpserted.ownerUserId`) | yes | yes | |
| `MERCHANT_ACCEPTED`, `PREPARING`, `RIDER_ASSIGNED` | customer | yes | | |
| `PICKED_UP` | customer | yes | | yes |
| `DELIVERED` | customer | yes | yes | |
| `CANCELLED`, `REJECTED_BY_MERCHANT` | customer | yes | yes | yes |
| `PREPARING` | every delivery partner (broadcast, audience `PARTNER`) | yes | | |
| `DeliveryAssigned` (fleet) | the partner who took it | yes | | |
| `PaymentFailed`, `RefundIssued` (payment) | customer of the order | yes | yes | |

`CREATED`, `PAYMENT_FAILED` and `REFUNDED` statuses say nothing: the events above already cover them. The policy and
the wording live in one pure class, `domain/Templates`, with its own unit tests.

## How it works
- **Contacts.** identity-service publishes `UserContactUpdated` when a phone is verified (OTP) or an email is verified
  (link or password reset). Unverified emails are never published. The values are **encrypted** (AES-256-GCM,
  `base64(IV || ciphertext)`) with `CONTACT_EVENT_KEY`, a key shared only by identity (encrypts) and this service
  (decrypts), so neither the outbox nor the feed nor the `user_contact` table holds a plain phone or email. The
  ciphertext is stored as received and decrypted only when a message is sent. `UserDeleted` erases the person's
  contacts, inbox and queued messages.
- **Addressing.** Payment, refund and delivery events carry only an order id, so `order_ref` keeps who the customer is
  from the order feed. If the order feed has not delivered the order yet the event fails and is retried on the next
  poll (then parked like any failing event).
- **Idempotent.** Every notification has a `dedupe_key` (`order:<id>:<status>`, `refund:<id>`, ...), so replays never
  notify twice.
- **No stale messages.** An event older than `NOTIFY_MAX_EVENT_AGE_MINUTES` (default 60) still updates replicas but sends
  nothing, so the first start or a long outage never messages customers about finished orders.
- **Outbound queue.** Events only insert `delivery` rows (EMAIL / SMS). `DeliveryDispatcher` sends them every few seconds
  with `FOR UPDATE SKIP LOCKED`, so a slow provider never blocks events and a failure is retried with growing delay
  (`NOTIFY_DISPATCH_MAX_ATTEMPTS`, default 5, then `FAILED`). A person with no verified contact for the channel is
  retried the same way and then `SKIPPED`; the inbox message is always kept.
- **Providers.** `SmsSender` / `EmailSender` interfaces. `SMS_PROVIDER=logging` and `EMAIL_PROVIDER=logging` (default)
  write the message to the log with the recipient **masked**. Real providers are added behind the same interfaces.
- **Retention.** A nightly job deletes notifications older than `NOTIFY_RETENTION_DAYS` (default 30).

## Endpoints (any signed-in user; the edge path is `/api/notifications/...`)
`GET /notifications?limit=30` -> `{unread, items:[{id, kind, title, body, orderId, createdAt, read}]}` (own messages
plus broadcasts to roles in the token, newest first), `GET /notifications/unread-count`, `POST /notifications/{id}/read`,
`POST /notifications/read-all`. Someone else's notification answers 404, like one that does not exist.
Broadcasts (a new delivery job) stay in a partner's inbox for `NOTIFY_BROADCAST_TTL_MINUTES` (default 120) and each
partner keeps their own read mark (`notification_read`).

`ADMIN`: `GET /notifications/admin/dead-letters`, `POST .../{id}/retry` and `/discard` (same rules as the other consumers).

The storefront polls the unread count every 30 s while the tab is visible (no streams, so nothing here is per-instance
state) and shows a bell for customers, restaurant owners and partners, plus `/notifications`.

## Config
`CONTACT_EVENT_KEY` (base64, 32 bytes, required outside the `local` profile), `SMS_PROVIDER`, `EMAIL_PROVIDER`,
`IDENTITY_FEED_URL/KEY`, `CATALOG_FEED_URL/KEY`, `ORDER_FEED_URL/KEY`, `PAYMENT_FEED_URL/KEY`, `FLEET_FEED_URL/KEY`,
`FEED_POLL_MS`, `FEED_MAX_ATTEMPTS`, `NOTIFY_*` above, plus the common variables (`JWT_PUBLIC_KEY_PEM`, `DB_*`).
A blank feed key disables polling of that producer. Changing `CONTACT_EVENT_KEY` makes stored contacts unreadable until
identity republishes them. Tests: `mvn verify` (use `TEST_DB_URL` to run without Docker).
