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
- Git state at the time of writing: one commit ("Intial Skelton_ForStorefront"), and about 158 changed or new paths
  that are **not committed**.

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
    - **Not yet live:** nothing is deployed to GCP yet (see section 8).

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

**Last verified test counts (30 Oct 2026):** identity 86, catalog 65, payment 41, fleet 28, order 92, notification 49
backend tests; storefront 47 Vitest tests; `tsc`, lint and build clean; the full smoke test passed (including the
notification checks) before the local stack was removed. GitHub CI is green on `develop`.

## 5. Google Cloud sandbox (current state: RUNNING since 30 Oct 2026, left on at the owner's request)

Project `veggo-eats-6110`, region `asia-south1` (Mumbai), account `nagireddy.mudusu@gmail.com`, free-credit billing
account with a ₹1,500 monthly budget alert. Details and commands: [../deploy/gcp/README.md](../deploy/gcp/README.md).

| Resource | Name / value | State now |
|---|---|---|
| VM | `veggo-sandbox-vm`: e2-medium, Ubuntu 24.04, zone `asia-south1-a`, 20 GB | **RUNNING** (all six services deployed) |
| Cloud SQL | `veggo-sandbox-db`: PostgreSQL 16, db-f1-micro, six DBs and users (`identity`, `catalog`, `order`, `payment`, `fleet`, `notification`), PostGIS in `catalog`, no authorized networks | **RUNNABLE** (`activation-policy=ALWAYS`) |
| Static IP | `veggo-sandbox-ip` = 34.47.166.37 | in use |
| URL | `https://34-47-166-37.sslip.io` (free sslip.io host, Caddy gets the Let's Encrypt certificate) | live |
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

**Cost while running:** roughly ₹2,000 to ₹2,500 a month (VM about $25, Cloud SQL about ₹800 to ₹1,000). While stopped
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
deploy/scripts               smoke.mjs (runs on the VM after a deploy), gen-cloud-env.mjs (secrets for app.env)
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
- Account deletion's effect inside notification-service (erasure of contacts and inbox) was not checked on the cloud.
- The IAM roles on the VM service account were bound but not audited.
- Real Razorpay, SMS and email providers (none connected).

## 9. Remaining work (suggested order)

**Now (agreed 30 Oct 2026): fix the findings from the full sandbox test below, then return to the parked enhancements.**

**Sandbox test, 30 Oct 2026 (all six services deployed and exercised in a browser; QA data is still in the sandbox):**
Worked: browsing and filters, cart, guest OTP checkout, fake payment, live status, public tracking, email register / verify /
login, admin sign-in, flags (toggle and restore), admin team (invite, accept, remove), restaurant accept/prepare, rider
online/accept/pick-up/deliver with wrong and right delivery code, cancel, reject, payment failure, admin refund, and the
whole notification path (inbox, bell, SMS and email logs with masked recipients, UserContactUpdated for a late-verified
email, role broadcast and per-user read marks, zero dead letters, role checks).
Findings, most important first:
1. ~~**No refund when a paid order is cancelled or rejected**~~ **FIXED (30 Oct 2026, not yet committed).** payment-service now
   consumes order-service's feed (`OrderFeedConsumer`, `closed_order` + feed cursor/dead-letter tables in migration V3,
   `ORDER_FEED_URL`/`ORDER_FEED_KEY` in `run-service.sh`, ADMIN dead letters at `/payments/admin/dead-letters`). A cancel or
   reject refunds the captured payment (key `auto:<paymentId>`) and order-service moves the order to `REFUNDED`; a capture
   that arrives after the order closed is refunded at once. Tested: 9 new payment tests (50 in the service, all green) and the
   sandbox for both customer cancel and restaurant reject (order `REFUNDED`, payment `REFUNDED`, refund notification).
   Still open: no admin UI for manual refunds (API only).
2. ~~**Partner screen: "Available orders" stays empty after going Online**~~ **FIXED (not yet deployed or committed).** The
   dashboard now reloads when the online flag changes and ignores the 409 a pool request gets right after going offline; the
   stale error banner is cleared after a successful refresh. Tested in a browser (local storefront against the sandbox):
   pool appears in under a second. One harmless 409 may still show in the console on the offline switch (finding 9).
3. ~~**Live-stream push errors**~~ **FIXED and deployed (not committed).** Cause: `StaffStreamHub`/`FleetStreamHub` called
   `emitter.complete()` in their error handler, which itself throws once the container has closed the connection, aborting the
   heartbeat loop. Dead connections are now dropped without throwing. Tests: `StaffStreamHubTest`, `FleetStreamHubTest`; no
   scheduler errors in the sandbox after dropping streams.
4. ~~**Logs show `?` for the rupee sign**~~ **NOT A BUG.** The VM logs contain the real ₹ (U+20B9); the `?` came from the
   Windows terminal when reading with gcloud. Documented in `deploy/gcp/README.md` (set a UTF-8 console).
5. ~~**Public API docs / security headers**~~ **FIXED and deployed (not committed).** The Caddyfile now returns 404 for every
   service's `/v3/api-docs` and `/swagger-ui*` and sends CSP, X-Frame-Options and Permissions-Policy. Checked in a browser: no
   CSP violations on home, login and track. When Razorpay Checkout is enabled, extend the CSP (note in the Caddyfile).
6. **Notification copy and lifecycle:** "Order placed: complete the payment" is shown after payment already happened; the
   "New delivery job" broadcast stays in other riders' inboxes after the job is taken (up to 2 h); it says "Open Jobs" but
   there is no Jobs tab.
7. **Navigation:** no header link to the kitchen (`/restaurant`) or partner (`/partner`) area; the customer header shows an
   "Admin" link to a non-admin session (leads to the admin sign-in page).
8. **Admin gaps:** no UI to grant the restaurant-owner role or link a restaurant to its owner (API only); the dashboard tile
   "Orders, restaurants and users" is a placeholder; the `delivery_module` flag text still says the fleet service is not
   built; dead letters have no UI or alerting.
9. **Console noise:** a 401 right after every sign-in, 404 for `/fleet/me` before partner registration, aborted
   mark-read and stream requests on navigation.
10. **Product questions:** non-veg items are listed under the "All" diet at a "Tier 2 segregated" kitchen; legal pages are
    still drafts with placeholders.
11. **Ops:** on the first boot after a deploy identity crash-looped until the installer replaced `app.env` (old units start
    first; harmless but noisy); existing users still need a contact backfill for email/SMS.
QA data left in the sandbox: users `qa.admin`, `qa.admin2` (admin removed), `qa.owner`, `qa.customer` (@example.com),
phone users 9811100001 (customer) and 9811100002 (rider), about ten orders, and the restaurant `Spice Route Kitchen` now
linked to `qa.owner@example.com`. The main admin is back on `nagireddy.mudusu@gmail.com`.

**Parked enhancements (to plan later), roughly by value:**
- **A. Automated GCP deploy:** one script or a GitHub Action (Workload Identity Federation) that builds the jars and
  storefront, uploads them to the bucket and resets the VM, replacing the manual steps in `getting-started.md`.
- **B. Notifications go-live:** create the `notification` database and user, deploy, backfill contacts for users who
  registered before this release, real email sender and (after DLT) SMS behind `EmailSender` / `SmsSender`, per-user
  notification preferences, possibly push.
- **C. Hardening:** Secret Manager instead of the bucket, CSP headers, Cloud SQL private IP and IAM logins, uptime checks
  and alerts, a tested database restore.
- **D. Product:** OpenStreetMap restaurant import and maps, Razorpay once approved.
- **E. Repo and branches:** make `develop` the default branch (it is still `master`, the initial skeleton), delete the
  merged `feature/*` branches.

**Older list (still valid):**
1. **Buy `veggoeats.in`**, point DNS, and fill the legal details in `storefront/src/lib/brand.ts`.
2. **Real providers:** Razorpay (needs approval; set `GATEWAY=razorpay`, keep `ALLOW_FAKE_GATEWAY=false`), SMS (DLT
   registered) and an email sender (implement `SmsSender` / `EmailSender` in notification-service and select with
   `SMS_PROVIDER` / `EMAIL_PROVIDER`; identity-service has its own senders for OTPs and links). Then `SEED_DEMO_DATA=false`.
3. **Maps and restaurant data:** import restaurants from OpenStreetMap and add maps to the storefront.
4. **Notifications follow-ups:** deploy to the GCP sandbox (see section 8), a backfill of contacts for users who
   registered before this release, per-user notification preferences, and web/mobile push if wanted.
5. **Hardening not done yet:** browser security headers (CSP), Secret Manager instead of the bucket for secrets,
   Cloud SQL private IP and IAM logins, monitoring and alerts, backup restore test, Cloudflare and rate limiting.
6. **Before running more than one instance of any service:** move rate limits and live-stream state to shared storage
   (Redis or Postgres `LISTEN/NOTIFY`).
7. **Production GCP setup:** bigger database tier with high availability and point-in-time recovery, then repeat the
   sandbox steps for production.
8. Commit the pending changes (owner does this).

## 10. Tips for the next agent

- Read [architecture.md](architecture.md), [../contracts/CONVENTIONS.md](../contracts/CONVENTIONS.md) and
  [deployment.md](deployment.md) before changing cross-service behaviour.
- Keep services independent: no shared code, no direct calls. Add a JSON Schema to `contracts/events/` when adding or
  changing an event, and update the consumer contract tests.
- Validate each step (CI tests, then the smoke test after a sandbox deploy) before the next one.
- Ask the owner before creating paid cloud resources, and create them as a sandbox first.
- Never print, log or commit anything from `deploy/local/*.env`.
