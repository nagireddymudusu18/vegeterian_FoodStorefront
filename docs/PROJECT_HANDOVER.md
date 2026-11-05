# Veggo Eats: project handover

Written for a new person or AI agent picking this project up cold. It explains what the product is, what was built,
how it runs on Google Cloud (nothing runs locally any more), what was decided and why, what is verified, and what is left.
Read this first, then follow the links to the detailed docs.

> **No secrets are in this file.** Passwords and keys live in git-ignored files under `deploy/local/`
> (`cloud-app.env`, `gcp.env`). Never commit or paste them.

---

## 1. Product and owner

- **Veggo Eats** (domain to buy: `veggoeats.in`, tagline "Veg, on the go."): an on-demand food marketplace for India,
  serving **Pure Veg, Vegan and Jain** customers only.
- One solo developer, working on a managed Windows 11 Enterprise laptop (no admin rights, corporate TLS inspection).
- **Working rules the owner set (keep following them):**
  - The **owner makes every git commit and push**. Keep changes local and never commit.
  - Do big decisions one at a time and **ask before** choosing between real alternatives.
  - Do plan items **one at a time and validate after each step**.
  - **Any GCP resource is created as a sandbox first.**
  - Security issues get fixed, not just reported.
  - Keep answers concise.
- Git state (31 Oct 2026): `develop` holds everything merged through PR #3 (fleet and GCP sandbox #1, notifications #2,
  sandbox findings fixes #3, commit `be9145d`). The default branch on GitHub is still `master` (the initial skeleton).
  The owner opened and merged the PRs; new work starts from a branch cut from `origin/develop`.

## 2. Architecture in one page

Six independent Spring Boot microservices plus a Next.js storefront. Full detail: [architecture.md](architecture.md).

| Service | Port | Owns |
|---|---|---|
| identity-service | 8081 | Users, OTP and email/password login, JWT (RS256) issuing, roles, admin team and invites, encrypted PII |
| catalog-service | 8082 | Restaurants, menus, nearby search (PostGIS) |
| order-service | 8083 | Orders and status machine, live status stream (SSE), dead-letter admin |
| payment-service | 8084 | Payments, gateway adapter (Razorpay or fake), webhooks |
| fleet-service | 8085 | Delivery partners, job pool, pickup and delivery with customer OTP, live stream |
| notification-service | 8086 | In-app inbox, email and SMS queue; consumes the other five feeds, publishes nothing |
| storefront (Next.js) | 3000 | Customer site, restaurant screen, admin console, partner (rider) screens, notification bell |

**Independence rules (do not break):**
- Each service has **its own database** and its own Flyway migrations.
- **No shared library** between services, and **no synchronous service-to-service calls**.
- Services talk through a **Postgres outbox plus a pull feed**: the producer writes events to an `outbox` table in
  the same transaction, exposes `/internal/events` guarded by an `X-Internal-Key` header, and consumers poll with a
  stored `feed_cursor`.
- JWTs are signed by identity-service; every other service validates them **locally** with `JWT_PUBLIC_KEY_PEM`.
- Money is `long` paise. Errors are RFC 7807 problem responses.

**Order flow:** the storefront creates the order (CREATED), then calls payment. Payment-service records the payment
and publishes an event. Order-service polls the payment feed and moves CREATED to PAID if the amounts match. Fleet-service
polls the order feed to create delivery jobs for paid orders.

**Event contracts:** `contracts/events/*.json` holds 12 JSON Schemas (with `x-producer`, `x-consumers` and an example).
Producers validate in tests, and order-service and fleet-service have consumer contract tests.
See [../contracts/CONVENTIONS.md](../contracts/CONVENTIONS.md).

## 3. What was built (in order)

1. **Milestone 1 skeleton:** the four original services (identity, catalog, order, payment) and the storefront.
2. **Realtime order updates:** `GET /orders/{id}/stream` (SSE). Ownership is checked on connect; only
   `{"status":"..."}` is pushed after commit; heartbeat every 25 s; caps of 5 streams per order and 5000 total (429
   beyond). The storefront uses fetch streaming with a Bearer token and polls as a fallback.
3. **Restaurant order screen** and **admin dashboard** in the storefront.
4. **Fleet service** (fifth service): partners go online, accept jobs from a pool, pick up, and deliver using the
   customer's OTP. It has its own live stream.
5. **Branding and legal pages:** "Veggo Eats" in `storefront/src/lib/brand.ts` (legal details still to fill in),
   privacy, terms and refund pages.
6. **Deploy files:** `deploy/gcp/` (VM install scripts and runbook) and the GitHub CI workflows. A Docker + GHCR + SSH
   deploy path (`deploy/prod`, `deploy.yml`) and Kubernetes and Oracle files were removed on 30 Oct 2026: they never
   matched the GCP sandbox and the deploy workflow failed on every push. They are in git history.
7. **Local stack (removed 30 Oct 2026):** a Docker-free local stack (portable Postgres, jar runner, dev gateway), the dev
   Docker compose stack and the Makefile were removed once everything ran on GCP. Tests run in GitHub CI.
8. **Admin email login with one main admin:**
   - `APP_MAIN_ADMIN_EMAIL` is the main admin (gets ADMIN and SUPER_ADMIN). It replaces the old `APP_ADMIN_EMAILS`.
   - Admin signs in at `/admin/login` with email and password. An emailed code is optional, via the
     `admin_login_code` feature flag (off by default).
   - OTP login, `/auth/login` and email verify **never** issue admin roles. Refresh tokens carry an `admin_session` flag.
   - The main admin invites other admins by email at `/admin/team`; the invitee accepts at `/admin/accept`.
9. **Architecture and security review.** A security review found four issues, all fixed:
   - The fake payment gateway could start in production. It now needs `ALLOW_FAKE_GATEWAY=true`, and `GATEWAY` is
     required in prod compose.
   - Open redirect after login: fixed by `storefront/src/features/auth/redirect.ts` (`safeInternalPath`).
   - `deploy.yml`: third-party actions pinned to commit SHAs, and `SSH_HOST_FINGERPRINT` required (the workflow was removed later).
   - k8s ingress: blocked `/internal` and `/actuator` (the manifests were later removed; the Caddy edge does this now).
   - Design-pattern self-score was about 8/10.
   - **Security review, 31 Oct 2026:** one low finding (not yet committed, to be confirmed by CI): CI workflows used the mutable
     tag `dorny/paths-filter@v3` and had no `permissions:` block. It is now pinned to a commit SHA and both workflows set
     `permissions: contents: read`. No other exploitable issues were found in auth, roles, internal feeds, webhooks,
     ownership checks, injection or the open-redirect guard.
10. **Design improvements** (all validated):
    - Split big classes: `UserService` into `RoleResolver`, `TokenIssuer` and `UserService`; `AdminAccessService`
      into `AdminLoginService` and `AdminTeamService`.
    - Contract checks for events (section 2).
    - **Retries and dead letters** in order and fleet: `AbstractFeedPoller` retries a failing event up to 5 times
      (`FEED_MAX_ATTEMPTS`) then parks it in `feed_dead_letter`; malformed events are parked at once. Admin APIs:
      `/admin/dead-letters` (order) and `/fleet/admin/dead-letters` (fleet), with retry and discard.
    - **Observability:** `X-Request-Id` in every service, JSON logs under the `json` profile, Prometheus at
      `/actuator/prometheus` (`feed_events_total`, `feed_dead_letters_open`). See [observability.md](observability.md).
    - **Deferred on purpose:** shared state (Redis or similar) for rate limits and live streams. It is not needed
      until more than one instance of a service runs. Documented under "Known limits" in [deployment.md](deployment.md).
11. **Google Cloud sandbox:** Cloud SQL plus one VM running the whole stack (section 5).
12. **Notifications (30 Oct 2026):** new `notification-service` (:8086, own `notification` database), a pure feed consumer.
    - In-app inbox (storefront bell for customers, restaurant owners and partners, plus `/notifications`), email and SMS.
      Email and SMS use `logging` providers (recipient masked in the log) until real ones are connected.
    - Who is told what is one pure class, `domain/Templates` (table in [services/notification-service.md](services/notification-service.md)).
    - identity-service now publishes `UserContactUpdated` (VERIFIED phone/email only), **encrypted** with the new
      `CONTACT_EVENT_KEY` shared only by identity and notification. New contract `contracts/events/UserContactUpdated.json`
      (12 schemas now); `x-consumers` updated on the events notification reads.
    - Wired into gen-cloud-env, the GCP Caddyfile and VM scripts, CI, and the smoke test (inbox follows a whole order;
      SMS sent with the number masked). It passed the full local smoke test before the local stack was removed.
    - Deployed to the GCP sandbox and exercised in a browser on 30 Oct 2026 (sections 8 and 9).

## 4. Working from the laptop (nothing runs locally)

The app runs only on GCP (section 5). The laptop is used to edit code, build artifacts and run `gcloud`. Tests run in
GitHub Actions (`ci-java-services`, `ci-storefront`), which have passed on every branch and PR so far. History: a
Docker-free local stack existed until 30 Oct 2026 (portable Postgres + PostGIS, a jar runner, a dev gateway, a dev
compose stack and a Makefile). It was removed with the local Postgres, the Maven cache and build outputs; they can be
recovered from git history and re-downloaded if ever needed.

Tools under `%USERPROFILE%\tools`: JDK 21, Maven 3.9.9, gcloud (plus a gcloud TLS helper). Node is installed system-wide.
`storefront/node_modules` is kept so the storefront can be linted, tested and built.

Shell setup per command (PowerShell):
```
$root="$env:USERPROFILE\tools"; $env:JAVA_HOME="$root\jdk21"
$env:Path="$root\jdk21\bin;$root\apache-maven-3.9.9\bin;$env:Path"
$env:MAVEN_OPTS="-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT"
```

| Task | Command |
|---|---|
| Storefront checks | in `storefront/`: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` |
| Service unit tests | `mvn -B test` in a `services/<name>-service` folder (no database needed) |
| Service integration tests | `mvn -B verify` needs Docker (Testcontainers) or `TEST_DB_URL` pointing at a Postgres (see [getting-started.md](getting-started.md)); normally let CI run them |
| Build and deploy to the sandbox | [getting-started.md](getting-started.md) "Build and deploy to the sandbox" and [../deploy/gcp/README.md](../deploy/gcp/README.md) |
| End-to-end check | `deploy/scripts/smoke.mjs` runs on the VM once after a deploy when `RUN_SMOKE=1` is in `app.env` |

**Windows gotchas that cost time before:**
- "could not reserve shared memory region (error 487)" can fail a Java process start once; retry.
- Write Java files **without a UTF-8 BOM** (javac fails on it).
- Incremental `mvn test` once reused a stale compiled class after edits; use `mvn clean verify` when results look wrong.
- In PowerShell, comma lists in native args need quotes (`"--allow=tcp:80,tcp:443"`); do not name a parameter `$args`.
  In Windows PowerShell 5, quote SQL identifiers passed to native tools with `\"`.

**Last verified test counts (4 Nov 2026):** identity 88 (including `ContactPublisherTest` fixed for `AesGcmPiiCipher` + `ContactEventCipher`), catalog 65, payment 50 (after the auto-refund work), fleet 28 (with `DbActionsTest` aligned to `minimum-idle: 1`),
order 92, notification 49 backend tests; storefront 91 Vitest tests across 21 suites + 29 `node:test` assertions across 7 spec files (`mock-backend.spec.ts`, `admin-ops.spec.ts`, `rider-ops.spec.ts`, `customer-ops.spec.ts`, `kitchen-ops.spec.ts`, `roles.spec.ts`, `assets.spec.ts`) (4 Nov 2026, after Pure-Veg default, non-veg add confirmation, cart diet/allergen guardrails, interactive Bengaluru map & neighbourhood location picker, admin manual refunds, dead-letter alerting, kitchen menu & 86 self-service, Finding 11 VM boot order + contact backfill, full 4-module Playwright E2E validation, and Culinary Content Assets + Interactive Header/Footer); `tsc`, lint and build clean; the full smoke test passed
(including the notification checks) before the local stack was removed.

## 5. Google Cloud sandbox (current state: STOPPED on 3 Nov 2026; VM `TERMINATED`, Cloud SQL `STOPPED`; last deploy has the redesign G1 to G6, not G7 or finding 12)

Project `veggo-eats-6110`, region `asia-south1` (Mumbai), account `nagireddy.mudusu@gmail.com`, free-credit billing
account with a ₹1,500 monthly budget alert. Details and commands: [../deploy/gcp/README.md](../deploy/gcp/README.md).

| Resource | Name / value | State now |
|---|---|---|
| VM | `veggo-sandbox-vm`: e2-medium, Ubuntu 24.04, zone `asia-south1-a`, 20 GB | **TERMINATED** (stopped 3 Nov; the six jars are unchanged from 30 Oct and the storefront in the bucket has G1 to G6) |
| Cloud SQL | `veggo-sandbox-db`: PostgreSQL 16, db-f1-micro, six DBs and users (`identity`, `catalog`, `order`, `payment`, `fleet`, `notification`), PostGIS in `catalog`, no authorized networks | **STOPPED** (`activation-policy=NEVER`) |
| Static IP | `veggo-sandbox-ip` = 34.47.166.37 | reserved (small charge while the VM is stopped) |
| URL | `https://34-47-166-37.sslip.io` (free sslip.io host, Caddy gets the Let's Encrypt certificate) | down while the VM is stopped; after a start the first minutes show 502s (about 8 to 10 minutes until all APIs answer) |
| Service account | `veggo-sandbox-vm@veggo-eats-6110.iam.gserviceaccount.com` | Cloud SQL client, log and metric writer, read on the bucket |
| Bucket | `gs://veggo-eats-6110-sandbox-artifacts` (private): `jars/`, `storefront.tar.gz`, `app.env`, `vm/`, `scripts/` | holds the deploy artifacts and secrets file |
| Firewall | `veggo-allow-web` (tcp 80 and 443, tag `veggo-web`) | default SSH and RDP rules were deleted, so there is **no SSH** |

**What runs on the VM:** Caddy (public 80/443), the storefront (3000), the six services on 127.0.0.1:8081 to 8086, the
Cloud SQL Auth Proxy on 127.0.0.1:5432, and the Ops Agent (ships `/opt/veggo/deploy/local/*-service.log` to Cloud Logging
under the log name `veggo`). Everything is under `/opt/veggo`, run by systemd (`veggo@<service>`, `veggo-storefront`,
`veggo-caddy`, `veggo-proxy`). The services use at most 256 MB heap and 3 DB connections each.

**How deploys work without SSH:** the VM metadata `startup-script` is `deploy/gcp/vm/loader.sh`. On each boot it downloads
`vm/install.sh` from the bucket using the VM's token; that script installs the runtimes, downloads jars, storefront and
`app.env`, writes the systemd units and restarts everything. To deploy: rebuild, upload to the bucket, then
`gcloud compute instances reset veggo-sandbox-vm --zone=asia-south1-a`.

**Files for the VM:** `deploy/gcp/vm/{loader.sh,install.sh,run-service.sh,Caddyfile}`. `run-service.sh` gives each
service only the environment it needs. Secrets file generator:
`node deploy\scripts\gen-cloud-env.mjs --host 34-47-166-37.sslip.io --admin <email> [--acme-email <email>] [--smoke] [--keep-keys]`
writes `deploy/local/cloud-app.env`; upload it as `app.env`. `--keep-keys` keeps existing keys so stored data stays readable.
The storefront must be built with `NEXT_PUBLIC_API_BASE=https://34-47-166-37.sslip.io` (baked in at build time).

**Sandbox behaviour:** fake payment gateway (`GATEWAY=fake`, `ALLOW_FAKE_GATEWAY=true`), `logging` SMS and email
providers, `SEED_DEMO_DATA=true`. OTPs and verification links appear **only in the logs**, so read them from Cloud
Logging. **Do not take real orders here.** The current main admin is `nagireddy.mudusu@gmail.com`; register that email
on the site, read the verification link from the logs, then sign in at `/admin/login`.

**Bring it back up:**
```
. "$env:USERPROFILE\tools\gcloud-env.ps1"
gcloud sql instances patch veggo-sandbox-db --activation-policy=ALWAYS --project=veggo-eats-6110 --quiet
gcloud compute instances start veggo-sandbox-vm --zone=asia-south1-a --project=veggo-eats-6110
```
Start Cloud SQL first. The startup script reinstalls and restarts the stack on boot (about 3 to 6 minutes). The
database data is kept while the instance is stopped.

**Stop again:**
```
gcloud compute instances stop veggo-sandbox-vm --zone=asia-south1-a --project=veggo-eats-6110
gcloud sql instances patch veggo-sandbox-db --activation-policy=NEVER --project=veggo-eats-6110 --quiet
```
**Remove everything:** delete the VM, the address `veggo-sandbox-ip`, the bucket and the Cloud SQL instance.

**Cost while running:** roughly ₹70 to ₹85 a day, or ₹2,000 to ₹2,500 a month (VM about $25, Cloud SQL about ₹800 to ₹1,000). While stopped
you still pay a little for the disk, the reserved IP, Cloud SQL storage and the bucket.

**gcloud on this laptop** needs a session helper because the corporate network breaks its TLS: run
`. "$env:USERPROFILE\tools\gcloud-env.ps1"` before any gcloud command. It uses
`%USERPROFILE%\tools\gcloud-ssl-fix\sitecustomize.py` and a custom CA file. These live outside the repo.
Direct Postgres connections and the Cloud SQL proxy fail from the laptop (the handshake is reset), so there is no direct
database access from it. Data moves, if ever needed, go through a private bucket and `gcloud sql import/export`.

## 6. Repository map

```
services/{identity,catalog,order,payment,fleet,notification}-service/   Spring Boot services (Maven, Java 21)
storefront/                  Next.js 15, React 19, Tailwind 4, Vitest. Routes: (customer), admin, partner, restaurant
contracts/                   events/*.json (12 schemas) and CONVENTIONS.md
deploy/gcp                   GCP sandbox README and vm/ install files (loader, install, run-service, Caddyfile)
deploy/scripts               smoke.mjs (runs on the VM after a deploy), gen-cloud-env.mjs (secrets for app.env), local-cors-proxy.mjs (localhost to sandbox, adds CORS)
deploy/local                 Git-ignored: cloud-app.env and gcp.env (cloud keys and database passwords)
docs/                        architecture, getting-started, deployment, observability, per-service guides, this file
.github/workflows            ci-services, ci-storefront (both green on develop)
```

## 7. Configuration cheat sheet

Common env vars (see `deploy/gcp/vm/run-service.sh` for exactly what each service receives on the VM):
- All services: `SERVER_PORT`, `DB_URL`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_MAX`, `JWT_PUBLIC_KEY_PEM`, `INTERNAL_FEED_KEY`.
- identity: `JWT_PRIVATE_KEY_PEM`, `PII_ENC_KEY`, `PII_HMAC_KEY`, `CONTACT_EVENT_KEY`, `SMS_PROVIDER`, `EMAIL_PROVIDER`, `APP_BASE_URL`, `APP_MAIN_ADMIN_EMAIL`.
- catalog: `SEED_DEMO_DATA`.
- order: `CATALOG_FEED_URL/KEY`, `PAYMENT_FEED_URL/KEY`, `FLEET_FEED_URL/KEY`, `FEED_POLL_MS`, `FEED_MAX_ATTEMPTS`.
- payment: `GATEWAY` (`razorpay` or `fake`), `ALLOW_FAKE_GATEWAY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- fleet: `ORDER_FEED_URL/KEY`, `FEED_POLL_MS`.
- notification: `CONTACT_EVENT_KEY`, `SMS_PROVIDER`, `EMAIL_PROVIDER`, `IDENTITY|CATALOG|ORDER|PAYMENT|FLEET_FEED_URL/KEY`, `FEED_POLL_MS`, `NOTIFY_*`.
- Spring profiles: `json` for JSON logs in production; the cloud sandbox uses plain text logs so `smoke.mjs` can read OTPs.
- Changing `PII_ENC_KEY`, `PII_HMAC_KEY` or `CONTACT_EVENT_KEY` makes existing encrypted data unreadable.

## 8. What is verified and what is not

**Verified**
- All backend and storefront tests (GitHub CI on every push/PR, and locally on 30 Oct 2026), and the smoke test on the GCP VM (`SMOKE TEST PASSED`, before notifications) and locally (with notifications).
- On GCP (30 Oct 2026): all six services deployed and healthy, HTTPS works, `/actuator` and `/internal` return 404 from
  outside, logs reach Cloud Logging, and a full browser test passed (see the findings in section 9). Cloud Logging
  entries carry the text in `jsonPayload.message`, not `textPayload`, so filter on that.

**Not verified or untested**
- Deploy recipe for a new service on GCP (done 30 Oct for `notification`): create the Cloud SQL user and database with
  `gcloud sql users create` / `gcloud sql databases create`, give the user ownership with a small SQL import run as
  `postgres` (`GRANT "x" TO postgres; ALTER DATABASE "x" OWNER TO "x";` via a temporary private bucket), add `PW_X` to
  `deploy/local/gcp.env`, rerun `gen-cloud-env.mjs --keep-keys`, upload jars/`app.env`/`vm/` files, reset the VM.
  Existing users get no email/SMS contact until they verify again (identity only publishes on change).
- The Dockerfiles run only in CI (image build), never in a deployment. The GitHub CI workflows have passed on every run.
- The browser UI for the optional emailed admin code.
- Findings 6 to 8 are now checked in a browser (3 Nov 2026), and on 4 Nov 2026 the admin nav row, `/admin/flags`, `/admin/dead-letters`, `/admin/refunds`, `/restaurant/menu` and `/partner` were verified at `390x844` phone width with zero horizontal overflow (`scrollWidth === 390`) and zero console errors. Still unchecked against the live cloud sandbox: dead-letter retry and discard with real parked events.
- Account deletion's effect inside notification-service (erasure of contacts and inbox) was not checked on the cloud.
- The IAM roles on the VM service account were bound but not audited.
- Real Razorpay, SMS and email providers (none connected).

## 9. Remaining work (suggested order)

**Now (agreed 30 Oct 2026): fix the findings from the full sandbox test below one at a time, then return to the parked
enhancements.** Status on 31 Oct 2026: findings 1 to 9 are fixed and merged to `develop` (PR #3); 10 and 11 are not started.
The sandbox was started again on 2 Nov 2026 to deploy and test the storefront (see the F items below), and again on 3 Nov 2026, when
findings 6 to 8 and 12 were checked in a browser (see each finding).

**Sandbox test, 30 Oct 2026 (all six services deployed and exercised in a browser; QA data is still in the sandbox):**
Worked: browsing and filters, cart, guest OTP checkout, fake payment, live status, public tracking, email register / verify /
login, admin sign-in, flags (toggle and restore), admin team (invite, accept, remove), restaurant accept/prepare, rider
online/accept/pick-up/deliver with wrong and right delivery code, cancel, reject, payment failure, admin refund, and the
whole notification path (inbox, bell, SMS and email logs with masked recipients, UserContactUpdated for a late-verified
email, role broadcast and per-user read marks, zero dead letters, role checks).
Findings, most important first:
1. ~~**No refund when a paid order is cancelled or rejected**~~ **FIXED (30 Oct 2026, merged in PR #3).** payment-service now
   consumes order-service's feed (`OrderFeedConsumer`, `closed_order` + feed cursor/dead-letter tables in migration V3,
   `ORDER_FEED_URL`/`ORDER_FEED_KEY` in `run-service.sh`, ADMIN dead letters at `/payments/admin/dead-letters`). A cancel or
   reject refunds the captured payment (key `auto:<paymentId>`) and order-service moves the order to `REFUNDED`; a capture
   that arrives after the order closed is refunded at once. Tested: 9 new payment tests (50 in the service, all green) and the
   sandbox for both customer cancel and restaurant reject (order `REFUNDED`, payment `REFUNDED`, refund notification).
   **Admin manual refund UI added locally 4 Nov 2026 (`/admin/refunds`, not deployed, not committed):** payment lookup (`GET /api/payments/payments/{id}`), full or partial ₹ refund amount validation against `amountPaise - refundedPaise`, required audit reason, and destructive confirmation dialog (`POST /api/payments/payments/{id}/refund` with `Idempotency-Key`).
2. ~~**Partner screen: "Available orders" stays empty after going Online**~~ **FIXED and deployed (merged in PR #3).** The
   dashboard now reloads when the online flag changes and ignores the 409 a pool request gets right after going offline; the
   stale error banner is cleared after a successful refresh. Tested in a browser (local storefront against the sandbox):
   pool appears in under a second. One harmless 409 may still show in the console on the offline switch (finding 9).
3. ~~**Live-stream push errors**~~ **FIXED and deployed (merged in PR #3).** Cause: `StaffStreamHub`/`FleetStreamHub` called
   `emitter.complete()` in their error handler, which itself throws once the container has closed the connection, aborting the
   heartbeat loop. Dead connections are now dropped without throwing. Tests: `StaffStreamHubTest`, `FleetStreamHubTest`; no
   scheduler errors in the sandbox after dropping streams.
4. ~~**Logs show `?` for the rupee sign**~~ **NOT A BUG.** The VM logs contain the real ₹ (U+20B9); the `?` came from the
   Windows terminal when reading with gcloud. Documented in `deploy/gcp/README.md` (set a UTF-8 console).
5. ~~**Public API docs / security headers**~~ **FIXED and deployed (merged in PR #3).** The Caddyfile now returns 404 for every
   service's `/v3/api-docs` and `/swagger-ui*` and sends CSP, X-Frame-Options and Permissions-Policy. Checked in a browser: no
   CSP violations on home, login and track. When Razorpay Checkout is enabled, extend the CSP (note in the Caddyfile).
6. ~~**Notification copy and lifecycle**~~ **FIXED, deployed and checked in a browser 3 Nov 2026 (PR #3).** A paid, accepted order sent the
   rider a "New delivery job"; when the rider accepted it the broadcast disappeared and "Delivery assigned to you" appeared. notification-service
   now withdraws the rider "New delivery job" broadcasts once a job is taken or closed, and the copy was made clearer.
7. ~~**Navigation**~~ **FIXED, deployed and checked in a browser 3 Nov 2026 (PR #3).** An admin with a linked restaurant saw Admin and Kitchen; a rider saw only
   Deliveries and no Admin link. The header has Kitchen and Deliveries
   links for the matching roles, and the "Admin" link no longer shows to a non-admin session.
8. ~~**Admin gaps**~~ **FIXED, deployed and checked in a browser 3 Nov 2026 (PR #3).** The restaurant link form worked (linked an account to Green Leaf Vegan Kitchen),
   the dead-letter page showed its empty state and the corrected `delivery_module` text. New admin restaurants and dead-letter
   pages in the console (restaurant owner link, dead-letter retry/discard), and the `delivery_module` flag text was corrected
   (identity migration V6). **FIXED locally 4 Nov 2026 (not deployed, not committed):** dead-letter alerting (`AdminLayout` polls `deadLettersApi.list` across `orders`, `payments`, `fleet`, `notifications` every 30s and renders a `role="alert"` banner + red count badge in `StaffHeader`), Admin manual refund console (`/admin/refunds`), and Kitchen menu & 86 self-service (`/restaurant/menu` with live `findDietViolations` guardrail checks).
9. ~~**Console noise**~~ **FIXED, checked locally (PR #3).** The storefront refreshes the token before it expires, so the 401
   after sign-in is gone; the partner pool ignores the 409 on the offline switch. Harmless 404s for `/fleet/me` before partner
   registration and aborted requests on navigation may remain.
10. **Product questions:** ~~non-veg items are listed under the "All" diet at a "Tier 2 segregated" kitchen~~ **FIXED locally 4 Nov 2026 (Option B: `DEFAULT_DIET = "PURE_VEG"`, banner when switching to `"ALL"`, confirmation dialog before adding a non-veg dish, and dietary/allergen conflict check in Cart, CartSheet and Checkout; not deployed, not committed)**; legal pages are
    still drafts with placeholders.
11. ~~**Ops:** on the first boot after a deploy identity crash-looped until the installer replaced `app.env` (old units start
    first; harmless but noisy); existing users still need a contact backfill for email/SMS.~~ **FIXED locally 4 Nov 2026 (not deployed, not committed).**
    `deploy/gcp/vm/install.sh` now clears `/run/veggo-ready` and stops running `veggo@*` and `veggo-storefront` units before replacing `app.env` and `jars/*.jar` atomically via `.tmp` staging, gates `veggo@.service` and `veggo-storefront.service` on `ConditionPathExists=/run/veggo-ready` (so systemd does not start stale units during a VM reboot before `install.sh` finishes), and waits for `127.0.0.1:5432` (Cloud SQL Auth Proxy) before touching `/run/veggo-ready` and starting the services. `deploy/gcp/vm/Caddyfile` also enforces `request_body { max_size 1MB }` (`256KB` on `/webhooks/razorpay`). For the contact backfill, `identity-service` now exposes `POST /admin/contacts/backfill` (`ContactPublisher.backfillUser` + `UserService.backfillVerifiedContacts`), wired to a "Sync verified contacts" ops card on `/admin`.
12. ~~**Order page stops following a cancelled order (found 2 Nov 2026).**~~ **FIXED locally 3 Nov 2026 (not deployed, not committed).** `isTerminal` still
    marks `CANCELLED`, `REJECTED` and `MERCHANT_REJECTED` as failures, but the order page and the tracking page now keep following them
    for 3 minutes (`REFUND_FOLLOW_MS` in `features/orders/orders.ts`, hook `useKeepFollowing`) so the later move to `REFUNDED` shows up
    without a reload. `isFinal` is the "no more changes" check used to stop polling. An unpaid cancelled order never reaches `REFUNDED`, so
    it simply stops after the window. Checked on the sandbox 3 Nov 2026 with the local storefront: a paid order was cancelled and the page went Cancelled then Refunded within 6 seconds with no reload. The 3-minute window was my default (refunds took about a minute earlier; change the constant if you prefer another).
13. **Mobile header overflows (found 2 Nov 2026) - FIXED locally in G2.** At phone width the logo and "Track order" wrapped onto two lines and the Cart
    button was cut off, so the page scrolled sideways. The new header fits at 390 to 446px; checked on 8 pages.
QA data left in the sandbox: users `qa.admin`, `qa.admin2` (admin removed), `qa.owner`, `qa.customer` (@example.com),
phone users 9811100001 (customer), 9811100002 (rider) and 9811100077 (guest "QA Deploy Check", 2 Nov), about eleven orders
(the 2 Nov one was cancelled and auto-refunded), and the restaurant `Spice Route Kitchen` now
linked to `qa.owner@example.com`. The main admin is back on `nagireddy.mudusu@gmail.com`.
On 3 Nov 2026 `nagireddy.mudusu@gmail.com` turned out not to be registered in the sandbox database, so it was registered and verified through
the normal flow (verification link read from Cloud Logging) with a throwaway test password; set your own with "Forgot password" at `/admin/login`.
That account is now also linked as owner of `Green Leaf Vegan Kitchen`, and the QA rider (9811100002) took order `FA-RHJWH-83CVW` (left in progress).
Running the local storefront against the sandbox: the Caddy edge sends no CORS headers, so a small local proxy on port 8080 that forwards to the
sandbox and adds `Access-Control-Allow-Origin: http://localhost:3000` is needed (`deploy/scripts/local-cors-proxy.mjs`; the storefront's default API base is `http://localhost:8080`).

**Parked enhancements (to plan later), roughly by value:**
- **A. Automated GCP deploy:** one script or a GitHub Action (Workload Identity Federation) that builds the jars and
  storefront, uploads them to the bucket and resets the VM, replacing the manual steps in `getting-started.md`.
- **B. Notifications go-live:** backfill contacts for users who
  registered before this release, real email sender and (after DLT) SMS behind `EmailSender` / `SmsSender`, per-user
  notification preferences, possibly push. (The service itself is already deployed to the sandbox.)
- **C. Hardening:** Secret Manager instead of the bucket, Cloud SQL private IP and IAM logins, uptime checks
  and alerts, a tested database restore. (Browser security headers and the public API docs block are done.)
- **D. Product:** OpenStreetMap restaurant import and maps, Razorpay once approved.
- **E. Repo and branches:** make `develop` the default branch (it is still `master`, the initial skeleton), delete the
  merged `feature/*` branches (`feature/fleet-admin-gcp-sandbox`, `feature/notifications`, `feature/sandbox-findings-fixes`).
- **G. Storefront redesign (started 2 Nov 2026).** Owner's decisions: a fresh visual identity applied everywhere, taking the **mix**
  of concept A's palette ("Haldi & Leaf": cream `#FBF6EA`, ink `#1F2A1D`, leaf green `#1B5E3A`, turmeric `#E8A317`, haldi tint
  `#F3E6C4`) with concept B's type (Plus Jakarta Sans), and restaurants uploading their own photos (needs catalog-service
  changes, image storage and a CSP `img-src` change; not designed yet). The two concepts are in `design-preview.html` (Copilot
  session files folder, not in the repo). All text pairs pass WCAG AA. Built in small steps, each checked on desktop and phone width:
  - **G1 tokens and font: DONE locally.** `globals.css` remaps the Tailwind `stone`, `green`, `emerald` and `amber` scales to the palette
    (so existing classes re-skin without renames) and adds `cream`, `ink`, `leaf`, `turmeric`, `haldi`. Font from the
    `@fontsource-variable/plus-jakarta-sans` package (OFL, bundled files, no build-time network; works with CSP `font-src 'self'`).
    Theme colour, OG image and body word spacing updated.
  - **G2 logo and header: DONE locally.** `components/Logo.tsx` (leaf-on-square mark with turmeric motion lines), `app/icon.svg`
    (favicon), new header (`shell/Header.tsx`): logo, links, cart pill (`shell/CartSheet.tsx`), SVG bell, account button, and on
    phones a Menu sheet for the links. Fixes finding 13 (no sideways scroll on 8 checked pages at 446px).
  - **G3 home: DONE locally.** Shorter leaf-green hero with a turmeric sun (a small dot on phones), diet, quick-filter and cuisine
    chips in compact scrollable rows, the location shown as a place name with "Change", monogram tiles on restaurant cards (calm
    tints, no photo needed), Tier 2 badge in turmeric.
  - **G4 restaurant and menu: DONE locally.** Calmer dish rows (quiet "Contains ..." line instead of red chips), filled-green
    quantity stepper, chip diet filter, lighter header, sticky bar "N items · ₹X · View cart".
  - Deployed to the sandbox on 2 Nov 2026 (G1 to G4; not committed). Live check: Plus Jakarta Sans loads under the Caddy CSP, cream background,
    four restaurants with monogram tiles, no console or CSP errors, no sideways scroll at 446px on home and the menu, and the new cart bar works.
  - **G5 cart and checkout: DONE and deployed.** Shared styles in `globals.css` (`card`, `btn-primary`, `btn-secondary`, `page-title`) replace the
    seven copies of the old gradient button (cart sheet, cart, checkout, OTP login, login, forgot and reset password). Cart: filled-green
    steppers, one summary card with the checkout button, "Clear cart" as a text link. Checkout: one card holding the lines and the
    estimated total, a card for the guest sign-in.
  - **G6 orders, tracking, profile: DONE and deployed** (except one local-only tweak: the order number on the orders list no longer wraps
    mid-hyphen). New `features/orders/StatusPill.tsx` (green delivered, turmeric in progress, red failed or closed) used on the orders
    list, order detail and tracking. Order detail: pill status, turmeric-highlighted delivery OTP box, card sections. Tracking: leaf header
    with the turmeric dot. Profile and the other customer pages: cards and the heavier page title. Verified on the sandbox with a real guest
    order (OTP from Cloud Logging, placed, cancelled; QA phone 9811100088) at 390px and 1280px: no sideways scroll, no console or CSP
    errors. A scripted Edge run (`playwright-core` in a temp folder, not in the repo) is the reliable way to screenshot at phone width; the
    embedded VS Code browser tab is narrow and its screenshots go stale when the tab is hidden.
  - **G7 partner, kitchen and admin screens: DONE locally (3 Nov 2026, not deployed, not committed).** New `shell/StaffHeader.tsx` (brand
    mark, a haldi "Admin / Kitchen / Partner" tag, optional scrollable section links with the current page in leaf green, bell, Sign out)
    replaces the three dark headers (green, orange, black). Layouts no longer set a `bg-stone-50` page colour (cream shows through), and the
    admin, kitchen and partner pages use the shared `card` style and the heavier page title. Checked on 3 Nov 2026 with real sandbox data (local
        storefront): admin pages (dashboard, flags, deliveries, restaurants, dead letters, team) with the current section highlighted, the kitchen live
        orders and the partner dashboard all render with the new header, no console errors and no sideways scroll at 390px on the kitchen page; tsc, lint, 58
        tests and build clean. Checked on 4 Nov 2026 at `390x844` phone width: `/admin`, `/admin/refunds`, `/admin/dead-letters`, `/admin/flags`, `/restaurant/menu` and `/partner` all fit cleanly with `scrollWidth === 390` and zero console errors.
  - Next: dish photos once restaurant uploads exist.
- **F. Free building blocks (research, 31 Oct 2026; verify each vendor page before adopting).** Agreed order, one step at a
  time with validation after each: SEO built-ins, then sonner, then motion, then shadcn/ui. Status:
  - **F1 SEO built-ins: DONE and deployed to the sandbox on 2 Nov 2026 (not committed).** Root metadata (`metadataBase`, canonical,
    Open Graph, Twitter), `robots.ts`, `sitemap.ts` (public pages only), generated `opengraph-image.tsx`, Organization and
    WebSite JSON-LD typed with `schema-dts` (dev dependency), `lib/seo.ts` (+ tests; 51 storefront tests now). Indexing is
    **off by default**: without `NEXT_PUBLIC_ALLOW_INDEXING=true` (build-time) every page is `noindex` and `robots.txt`
    disallows all, so the sandbox stays hidden. In production set it plus `NEXT_PUBLIC_SITE_URL`; private areas always get
    `X-Robots-Tag: noindex` (`next.config.mjs`; keep its list in step with `PRIVATE_PREFIXES` in `lib/seo.ts`). Verified with
    `next start` in both modes (robots, sitemap, headers, meta, OG PNG). Not done yet: per-restaurant pages need a server
    component with `generateMetadata`, `Restaurant` JSON-LD and sitemap entries; the restaurant page is client-only and
    the catalog list needs coordinates, so this needs a design decision.
  - **F2 sonner toasts: DONE and deployed to the sandbox on 2 Nov 2026 (not committed).** `components/Toaster.tsx` mounted in
    `Providers`; toasts for add to cart (with a "View cart" action), starting a new cart, remove from cart (with Undo), clear
    cart and order cancelled. Form and API errors still use the inline `ErrorBox` (`role="alert"`) on purpose. Verified in
    a browser against a mock catalog API (toast, View cart navigation, remove and undo), plus tsc, lint, tests and build.
  - **F3 motion: DONE and deployed to the sandbox on 2 Nov 2026 (not committed).** `components/motion.tsx`: `MotionProvider`
    (`LazyMotion` + `domAnimation`, strict, so use `m` from that file, never `motion.*`; `MotionConfig reducedMotion="user"`)
    mounted in `Providers`, and a `FadeInItem` list item. Used for the restaurant cards, the menu rows (staggered fade-up),
    the cart badge pop in the header and the pulse on the current order step (`Stepper`). Verified in a browser against a
    mock API: stagger and badge animation run, no console errors, reduced-motion skips the movement, first-load JS unchanged
    at 103 kB. Do not add a CSS `transition` class that covers `transform` to an animated element.
  - **F4 shadcn/ui: DONE and deployed to the sandbox on 2 Nov 2026 (not committed).** Set up by hand (not the CLI) so nothing else
    in the styling changed: `components.json` (aliases point `ui` at `src/components/shadcn/`, because `components/ui.tsx`
    already exists), `lib/utils.ts` (`cn`), `tw-animate-css` imported in `globals.css`, and the `Skeleton` and `Sheet`
    primitives (Radix via the unified `radix-ui` package; plain stone/green colours, no theme variables). New:
    `components/Skeletons.tsx` (restaurant grid, menu and rows placeholders with `role="status"`, used on home, the
    restaurant page and orders) and `shell/CartSheet.tsx` (the header Cart opens a slide-over mini cart with +/-,
    remove, subtotal and checkout; on `/cart` and `/checkout` it stays a plain link; toasts are dismissed when it opens).
    Verified in a browser against a mock API: skeleton then content, sheet open/close (Escape, focus returns to the
    trigger), quantity changes, checkout navigation, no console errors; tsc, lint, 51 tests and build clean. Further shadcn
    components can be added with `npx shadcn@latest add <name>` (it may also install `lucide-react`). Not done: restyle
    `ConfirmDialog` with the Radix Dialog.
  - **Sandbox check of F1 to F4 (2 Nov 2026):** `robots.txt` is `Disallow: /`, every response has `X-Robots-Tag: noindex`, sitemap and OG image
    return 200, no CSP violations with the Caddy policy (sonner, motion and Radix work under `style-src 'unsafe-inline'`). Real flow on
    the live site: skeletons then four restaurants, add to cart toast, cart sheet, guest OTP checkout, fake payment, live stepper,
    cancel toast, auto-refund to `REFUNDED` (see finding 12 for the page not updating by itself).
    Deploy recipe used for a storefront-only change: build with `NEXT_PUBLIC_API_BASE=https://34-47-166-37.sslip.io`, package
    `.next/standalone/*` plus `.next/static` into `storefront.tar.gz`, upload it to the bucket, start the VM (or reset it if running).
  - Payment: `razorpay/razorpay-java` (MIT) server-side, hosted `checkout.js` on the client, a unique-constraint
    `webhook_events` table on `X-Razorpay-Event-Id`, own idempotency keys for orders and refunds, and a reconciliation job.
    Razorpay charges per transaction. Skip `react-razorpay` (stale).
  - Email: Spring Mail + Thymeleaf with the Brevo (about 300/day) or Resend (3,000/month, 100/day) free tier; Mailpit and
    GreenMail for dev and tests. Amazon SES is paid. SMS has no real free tier in India (DLT registration plus a paid wallet),
    so use email OTP first, register on DLT in parallel, then MSG91 over REST. WhatsApp utility templates are the cheaper phase 2.
  - SEO: Next.js built-ins (metadata, `sitemap.ts`, `robots.ts`, `opengraph-image`) plus `google/schema-dts` for
    Restaurant/Menu JSON-LD. No SEO runtime dependency needed.
  - UI: shadcn/ui + `radix-ui` + `tw-animate-css`, `motion`, `sonner`, `embla-carousel-react`, `react-hook-form` + `zod` +
    `input-otp`, and `maplibre-gl` with `@vis.gl/react-maplibre` on OpenFreeMap tiles (check its terms). Avoid `react-leaflet`
    (Hippocratic license), `next-sitemap` and OSM's public tile servers for production.

**Older list (still valid):**
1. **Buy `veggoeats.in`**, point DNS, and fill the legal details in `storefront/src/lib/brand.ts`.
2. **Real providers:** Razorpay (needs approval; set `GATEWAY=razorpay`, keep `ALLOW_FAKE_GATEWAY=false`), SMS (DLT
   registered) and an email sender (implement `SmsSender` / `EmailSender` in notification-service and select with
   `SMS_PROVIDER` / `EMAIL_PROVIDER`; identity-service has its own senders for OTPs and links). Then `SEED_DEMO_DATA=false`.
3. **Maps and restaurant data:** import restaurants from OpenStreetMap and add maps to the storefront.
4. **Notifications follow-ups:** a backfill of contacts for users who
   registered before this release, per-user notification preferences, and web/mobile push if wanted.
5. **Hardening not done yet:** Secret Manager instead of the bucket for secrets,
   Cloud SQL private IP and IAM logins, monitoring and alerts, backup restore test, Cloudflare and rate limiting.
   (CSP and related browser security headers are done in the Caddyfile.)
6. **Before running more than one instance of any service:** move rate limits and live-stream state to shared storage
   (Redis or Postgres `LISTEN/NOTIFY`).
7. **Production GCP setup:** bigger database tier with high availability and point-in-time recovery, then repeat the
   sandbox steps for production.
8. Findings 10 (product questions) and 11 (ops — resolved locally in `deploy/gcp/vm/install.sh`, `deploy/gcp/vm/Caddyfile`, and `POST /admin/contacts/backfill`) from the sandbox test.
9. **Customer Account Page (`/profile`) & End-to-End Platform Enhancements (DONE locally on 4 Nov 2026, not committed):**
   - **Identity & Encrypted Cross-Device Preferences (`identity-service` + Storefront):** Added `PATCH /me` (`UserService.updateName`), `V7__user_preferences.sql` (`preferences_enc BYTEA` encrypted with `PiiCipher` and wiped on DPDP erasure), `GET/PUT /me/preferences`, and automatic sync in `PrefsProvider`.
   - **Customer Account Dashboard (`/profile`):** Rebuilt `app/(customer)/profile/page.tsx` into a 5-section Haldi & Leaf dashboard (Identity/Verification, Default Diet & Personal Allergen Watchlist, Saved Delivery Addresses & Spots Manager, Recent Orders & Notifications snapshot, and DPDP Communication Consents + self-service Delivery Partner enrolment).
   - **Checkout Delivery Address & Kitchen Cooking Instructions (`order-service` + Storefront):** Added `V8__delivery_address_and_notes.sql` (`delivery_address`, `cooking_instructions`), updated `CreateOrderRequest`, `Order`, `OrderView`, `StaffOrderView`, and `OrderService.java`, and enhanced `/checkout`, `/orders/[id]`, and `/restaurant` so customers pick saved addresses + dietary cooking presets and kitchens see prep notes on live tickets.
   - **1-Tap Reorder & Printable GST Tax Invoice:** Added 1-tap **"Order again"** on `/orders` and `/orders/[id]`, plus a printable **Itemised GST Tax Invoice (`CGST 2.5%` + `SGST 2.5%`)** on `/orders/[id]`.
   - **Admin Restaurant Onboarding (`/admin/restaurants`):** Added **"+ Onboard restaurant"** (`POST /restaurants` in `catalog-service`) with 14-digit FSSAI license validation, Tier 1/Tier 2 certification selection, and Bengaluru hub coordinates.
   - **Latency & Connection-Pool Tuning (`run-service.sh` & `application.yml`):** Set `DB_POOL_MIN_IDLE=1` and `DB_POOL_IDLE_MS=300000` (5 min) across all 6 services to eliminate cold Cloud SQL proxy connection handshakes after 10s idle, lowered `FEED_POLL_MS` from `2000` to `1000` on the VM, and added `Cache-Control: public, max-age=15, stale-while-revalidate=60` on public `GET /flags` and `GET /restaurants`.
10. **CI Workflow Fixes & Full 4-Module Playwright Validation (DONE locally on 4 Nov 2026, not committed):**
    - **`ci-java-services` Workflow Fixes:**
      - `services/identity-service/src/test/java/in/foodapp/identity/service/ContactPublisherTest.java`: Fixed `test-compile` failure by instantiating `AesGcmPiiCipher(key(1), key(2))` and `ContactEventCipher(key(7))` directly instead of calling a nonexistent `new PiiCipher(props)` constructor or nonexistent `AppProperties` sub-records (`Email`, `Admin`, `Internal`), and added an AES-GCM `decode` helper matching `ContactEventCipherTest`.
      - `services/fleet-service/src/test/java/in/foodapp/fleet/DbActionsTest.java`: Updated `poolKeepsOneWarmStandingConnectionConfigured` to assert `((HikariDataSource) ds).getMinimumIdle()` is `1`, matching `minimum-idle: ${DB_POOL_MIN_IDLE:1}` in `services/fleet-service/src/main/resources/application.yml`.
    - **Playwright E2E Validation Across All 4 Modules (Desktop `1440×900` & Mobile `390×844`):**
      - **Module 1 — Customer Storefront (`/`, `/restaurants/[id]`, `/cart`, `/checkout`, `/orders`, `/orders/[id]`, `/track`, `/profile`):**
        - Verified Pure-Veg default (`PURE_VEG` filter chip active on load), warning banner + confirmation modal when switching to `"ALL"` and adding non-veg dishes at Tier-2 kitchens (`Spice Route Kitchen`), interactive Bengaluru SVG hub picker & pin-drop coordinates, CartSheet slide-over, OTP customer sign-in (`/login`), live order tracking (`/track?n=FA-7K2M9-P4X8Q` with 4-digit delivery OTP `4829` and rider badge), 1-tap **"Order again"** + printable **Itemised GST Tax Invoice (`CGST 2.5%` + `SGST 2.5%`)** on `/orders/[id]`, and the 5-section `/profile` dashboard (Identity, Dietary & Allergen Watchlist, Saved Delivery Addresses, Recent Orders/Notifications, and DPDP Consents).
      - **Module 2 — Restaurant / Kitchen Portal (`/restaurant/login`, `/restaurant`, `/restaurant/menu`):**
        - Verified dedicated Kitchen OTP sign-in (`9811100002`, Arjun Rao). **Defect found & fixed during validation:** `rest-saffron-1` (`Saffron Pure Veg Bhavan`) had `ownerUserId` set to `mainAdmin.id` (`...0001`) instead of `kitchenOwnerUser.id` (`00000000-0000-0000-0000-000000000002`), causing non-admin kitchen sessions on `/restaurant/menu` to show "No restaurant is linked to your account yet". Linked `rest-saffron-1` to `kitchenOwnerUser.id` (`...0002`), and verified the Live Orders board (`FA-7K2M9-P4X8Q` with customer cooking instructions, itemised dishes, and kitchen status actions) and Menu & 86 self-service (`/restaurant/menu` with restaurant Open/Paused toggle, 1-click Bulk 86 by ingredient/allergen, Bulk price adjustment with confirmation dialog, "+ Add dish" modal with live `findDietViolations` guardrail checks, and per-dish Available/86'd toggles).
      - **Module 3 — Delivery Partner / Fleet Portal (`/partner/login`, `/partner`):**
        - Verified dedicated Partner OTP sign-in (`9811100003`, Priya Nair). **Defect found & fixed during validation:** `riderPartnerUser` (`00000000-0000-0000-0000-000000000003`) was seeded with the `PARTNER` role in `storefront/src/lib/mock-backend.ts` but lacked an entry in the initial `partners` Map, causing `GET /api/fleet/fleet/me` to return `404` and show the onboarding screen instead of the active shift board. Seeded `riderPartnerUser.id` (`Priya Nair`, `EV Scooter`, `online: true`) into `partners`, and verified the live shift toggle (`Online`/`Offline`), GPS Broadcast (`12.9716, 77.5946`), active delivery card (`FA-7K2M9-P4X8Q`), and 4-digit customer OTP verification input (`4829`).
      - **Module 4 — Org Admin Console (`/admin/login`, `/admin`, `/admin/restaurants`, `/admin/deliveries`, `/admin/refunds`, `/admin/dead-letters`, `/admin/flags`, `/admin/team`):**
        - Verified password sign-in (`admin@veggoeats.in`), Dashboard KPIs + **"Sync verified contacts"** (`POST /admin/contacts/backfill`), Restaurants management (`+ Onboard restaurant` with 14-digit FSSAI validation + owner linking), Deliveries fleet monitor & manual rider assignment, Manual Refunds console (`/admin/refunds` with payment lookup, partial/full ₹ validation, and audit reason), Dead-letter queues across `orders`/`payments`/`fleet`/`notifications` with header alert banner, Feature Flags kill switches (`payment_gateway_v2`, `delivery_module`), and Admin Team RBAC (`MAIN_ADMIN` vs `SUB_ADMIN`).
      - **Responsive & Runtime Hygiene:** All checked routes (`scrollWidth === 390` at `390×844` mobile and `scrollWidth === 1440` at `1440×900` desktop) passed with zero horizontal overflow, zero console errors, and zero uncaught page errors.
11. **Culinary Content Assets & Interactive Customer Header / Footer (DONE locally on 4 Nov 2026, not committed):**
    - **Self-Hosted Culinary Content Assets & Artifacts (`storefront/src/features/catalog/assets.ts` + `CulinaryAsset.tsx`):** Added 4 studio culinary photography assets under `storefront/public/assets/food/` (`saffron-south-indian.jpg`, `green-leaf-vegan.jpg`, `jain-rasoi-thali.jpg`, `spice-route-north-indian.jpg`), served from the same origin (`/assets/food/...`) to comply strictly with the Caddy `img-src 'self' data:` CSP. Added `isSafeSelfHostedAssetUrl`, `resolveRestaurantAsset`, `resolveMenuItemAsset` (with per-dish focal crop coordinates), `<RestaurantCoverAsset />`, `<DishThumbnailAsset />` (with handcrafted `<CulinarySvgArtifact />` fallbacks), and `<CulinaryAssetPicker />` in `/restaurant/menu`.
    - **Interactive Customer Header (`storefront/src/shell/Header.tsx`):** Added an interactive **Dietary Guardrail live switcher** (`Pure Veg`, `Vegan`, `Jain`, `All`) with allergen watchlist badge and `/profile` shortcut, an interactive **Instant Order Lookup** popover with 1-tap demo order chips (`#FA-7K2M9-P4X8Q`, `#FA-3R8W5-V2N6J`), active-route highlighting (`aria-current="page"`), and an upgraded mobile navigation sheet with inline spot & dietary guardrail controls.
    - **Interactive Customer Footer & Admin Link Removal (`storefront/src/shell/Footer.tsx` & `profile/page.tsx`):** Removed the `/admin` (`Org Admin` / `Admin Console`) link from the customer footer, header, and customer profile page. Upgraded `Footer.tsx` with an interactive **Kitchen Standard Inspector** (`Tier 1` vs `Tier 2` certification tabs), interactive **Dietary Guardrails** filter buttons, interactive **Bengaluru Delivery Hubs** neighbourhood selector, an inline **Quick Order Tracker** form, and a smooth **Back to top (`Top ↑`)** button.

## 10. Tips for the next agent

- Read [architecture.md](architecture.md), [../contracts/CONVENTIONS.md](../contracts/CONVENTIONS.md) and
  [deployment.md](deployment.md) before changing cross-service behaviour.
- Keep services independent: no shared code, no direct calls. Add a JSON Schema to `contracts/events/` when adding or
  changing an event, and update the consumer contract tests.
- Validate each step (CI tests, then the smoke test after a sandbox deploy) before the next one.
- Ask the owner before creating paid cloud resources, and create them as a sandbox first.
- Never print, log or commit anything from `deploy/local/*.env`.
- After every enhancement or fix, update this file in the same change: finding and enhancement status, test counts,
  sandbox state (running or stopped) and the "Not verified" list. The owner asked for this on 31 Oct 2026.

## 11. Setting up on a new machine (written 3 Nov 2026 when the owner moved laptops)

Do these in order. Ask the owner for anything marked **owner**. Do not skip step 3's rule: secrets are never committed.

1. **Clone and branch.** Clone `https://github.com/nagireddymudusu18/vegeterian_FoodStorefront.git`. Work from a branch cut from
   `origin/develop` (the redesign and sandbox fixes are merged there; the branch `feature/staff-screens-refund-follow` holds the
   finding 12 fix and the staff screens until it is merged). Set `git config user.name` and `user.email` (**owner**); the owner makes every
   commit and push unless they say otherwise in the current conversation.
2. **Install tools** (Windows, no admin needed): JDK 21, Maven 3.9.9, Node (system-wide is fine) and the Google Cloud SDK. The shell setup
   for Java and Maven is in section 4. On the old laptop the tools lived in `%USERPROFILE%\tools`, and gcloud needed a TLS helper
   (`gcloud-env.ps1`, `gcloud-ssl-fix`) only because of the corporate network; a machine without TLS inspection will not need it.
   Then `npm ci` in `storefront/`. Check with `npx tsc --noEmit`, `npm run lint`, `npm test` (52 tests expected) and `npm run build`.
3. **Secrets in `deploy/local/` (git-ignored, must stay that way).** `cloud-app.env` and `gcp.env` hold the database passwords and the
   JWT, PII and feed keys. **Never remove `deploy/local/` from `.gitignore` and never commit these files.** Restore them safely:
   - Sign in: `gcloud auth login` as `nagireddy.mudusu@gmail.com` (**owner**), then `gcloud config set project veggo-eats-6110`.
   - `cloud-app.env` is the file uploaded to the private bucket as `app.env`, so it can be pulled back:
     `gcloud storage cp gs://veggo-eats-6110-sandbox-artifacts/app.env deploy/local/cloud-app.env`
     (this keeps the existing keys, so stored data stays readable; `gen-cloud-env.mjs --keep-keys` reads this file).
   - `gcp.env` (the `PW_*` database passwords) was also uploaded to the same private bucket on 3 Nov 2026 (path `secrets/gcp.env`, never in git):
     `gcloud storage cp gs://veggo-eats-6110-sandbox-artifacts/secrets/gcp.env deploy/local/gcp.env`
     It is only needed to regenerate `app.env` or to add a service. If it is ever missing, reset each Cloud SQL user's password with
     `gcloud sql users set-password`, write the new values into `gcp.env`, regenerate `app.env` with `--keep-keys` and redeploy.
     The bucket has public access prevention enforced and no public members. If you change `gcp.env`, upload it again to the same path.
   - Changing `PII_ENC_KEY`, `PII_HMAC_KEY` or `CONTACT_EVENT_KEY` makes existing encrypted data unreadable.
4. **Bring the sandbox back** only when it is needed (it costs about ₹70 to ₹85 a day): section 5 "Bring it back up" (Cloud SQL first, then the
   VM; allow about 20 minutes, with 502s for the first 8 to 10). Stop it again afterwards with "Stop again". The first minutes after a start
   are slow because the services start one by one.
5. **Run the storefront locally against the sandbox** (for UI review):
   - Start the proxy: `node deploy/scripts/local-cors-proxy.mjs` (listens on :8080 and forwards to the sandbox with CORS for `http://localhost:3000`).
   - In `storefront/`, with `NEXT_PUBLIC_API_BASE` unset (default `http://localhost:8080`): `npm run dev`, then open `http://localhost:3000`.
   - Pointing `NEXT_PUBLIC_API_BASE` straight at the sandbox does not work from localhost (CORS), and a build for deploy must use
     `NEXT_PUBLIC_API_BASE=https://34-47-166-37.sslip.io` (see section 5).
6. **Test accounts on the sandbox** (sandbox only; OTPs and email links appear in Cloud Logging under `jsonPayload.message`, not on screen):
   - Main admin `nagireddy.mudusu@gmail.com`: sign in at `/admin/login`. It was registered on 3 Nov 2026 with a throwaway test password,
     so use "Forgot password" and read the reset link from the logs, and set a real password (**owner**). It also owns `Green Leaf Vegan Kitchen`.
   - Rider: phone `9811100002` (QA Rider, OTP from the logs). Other QA accounts are listed at the end of section 9.
   - To read a log line: `gcloud logging read "jsonPayload.message:OTP" --project=veggo-eats-6110 --freshness=5m --limit=3 --format="value(jsonPayload.message)"`.
   - In the embedded browser or a script, wait for the page to hydrate (about 2 seconds after load) before typing into forms, or React clears the fields.
7. **Next steps once set up:** merge the PR for `feature/staff-screens-refund-follow`, then redeploy the storefront to the sandbox (recipe at the end of
   the F items in section 9) to put G7 and the finding 12 fix live; then continue with the parked enhancements (section 9).
