# Veggo Eats: project handover

Written for a new person or AI agent picking this project up cold. It explains what the product is, what was built,
how it runs locally and on Google Cloud, what was decided and why, what is verified, and what is left.
Read this first, then follow the links to the detailed docs.

> **No secrets are in this file.** Passwords and keys live in git-ignored files under `deploy/local/` and
> `deploy/compose/.env`. Never commit or paste them.

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

Five independent Spring Boot microservices plus a Next.js storefront. Full detail: [architecture.md](architecture.md).

| Service | Port | Owns |
|---|---|---|
| identity-service | 8081 | Users, OTP and email/password login, JWT (RS256) issuing, roles, admin team and invites, encrypted PII |
| catalog-service | 8082 | Restaurants, menus, nearby search (PostGIS) |
| order-service | 8083 | Orders and status machine, live status stream (SSE), dead-letter admin |
| payment-service | 8084 | Payments, gateway adapter (Razorpay or fake), webhooks |
| fleet-service | 8085 | Delivery partners, job pool, pickup and delivery with customer OTP, live stream |
| storefront (Next.js) | 3000 | Customer site, restaurant screen, admin console, partner (rider) screens |

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

**Event contracts:** `contracts/events/*.json` holds 11 JSON Schemas (with `x-producer`, `x-consumers` and an example).
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
6. **Production deploy files:** `deploy/prod/` (docker compose and Caddyfile), `deploy/k8s/`, GitHub workflows.
7. **Docker-free local stack** (the laptop cannot install Docker or WSL): portable PostgreSQL 16.4 plus PostGIS
   under `~\tools`, services run as jars, a Node dev gateway replaces Caddy.
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
   - `deploy.yml`: third-party actions pinned to commit SHAs, and `SSH_HOST_FINGERPRINT` is required.
   - k8s ingress: blocks `/internal` and `/actuator`.
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

## 4. Running it locally (Docker-free)

Prerequisites installed under `%USERPROFILE%\tools`: JDK 21, Maven 3.9.9, Node, portable Postgres, gcloud.

Shell setup per command (PowerShell):
```
$root="$env:USERPROFILE\tools"; $env:JAVA_HOME="$root\jdk21"
$env:Path="$root\jdk21\bin;$root\apache-maven-3.9.9\bin;$root\node;$env:Path"
$env:MAVEN_OPTS="-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT"
```

| Task | Command |
|---|---|
| Start local Postgres | `Start-Process powershell -ArgumentList '-File','deploy\scripts\local-db.ps1','start' -WindowStyle Hidden` |
| Build jars | `powershell -File deploy\scripts\local-run.ps1 build` |
| Start / stop / status | `local-run.ps1 up`, `down`, `status` |
| End-to-end smoke test | `node deploy\scripts\smoke.mjs` (needs a fresh stack; reads OTPs from `deploy/local/*.log`) |
| Backend tests (no Docker) | set `TEST_DB_URL=jdbc:postgresql://127.0.0.1:5432/postgres`, `TEST_DB_USER=postgres`, `TEST_DB_PASSWORD=` (empty), then `mvn verify` in a service folder |
| Storefront checks | in `storefront/`: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` |

Local URLs: dev gateway `http://localhost:8080`, storefront dev server `:3000`. Local DB users and passwords equal
the service names; the `postgres` superuser uses trust auth on 127.0.0.1.

**Windows gotchas that cost time before:**
- Run `local-run.ps1 down` before `mvn package` or `verify`, otherwise the running jars are locked.
- Start Postgres through `Start-Process` with file redirection; stopping a background shell that owns it kills it.
- "could not reserve shared memory region (error 487)" can fail a backend start once; retry.
- Write Java files **without a UTF-8 BOM** (javac fails on it).
- In PowerShell, comma lists in native args need quotes (`"--allow=tcp:80,tcp:443"`); do not name a parameter `$args`.

**Last verified test counts (local):** identity 80, catalog 65, payment 41, fleet 28, order 92 backend tests;
storefront 40 Vitest tests; `tsc`, lint and build clean; smoke test passes.

## 5. Google Cloud sandbox (current state: STOPPED)

Project `veggo-eats-6110`, region `asia-south1` (Mumbai), account `nagireddy.mudusu@gmail.com`, free-credit billing
account with a ₹1,500 monthly budget alert. Details and commands: [../deploy/gcp/README.md](../deploy/gcp/README.md).

| Resource | Name / value | State now |
|---|---|---|
| VM | `veggo-sandbox-vm`: e2-medium, Ubuntu 24.04, zone `asia-south1-a`, 20 GB | **TERMINATED** (stopped) |
| Cloud SQL | `veggo-sandbox-db`: PostgreSQL 16, db-f1-micro, five DBs and users (`identity`, `catalog`, `order`, `payment`, `fleet`), PostGIS in `catalog`, no authorized networks | **STOPPED** (`activation-policy=NEVER`) |
| Static IP | `veggo-sandbox-ip` = 34.47.166.37 | reserved (small cost while the VM is off) |
| URL | `https://34-47-166-37.sslip.io` (free sslip.io host, Caddy gets the Let's Encrypt certificate) | down while the VM is off |
| Service account | `veggo-sandbox-vm@veggo-eats-6110.iam.gserviceaccount.com` | Cloud SQL client, log and metric writer, read on the bucket |
| Bucket | `gs://veggo-eats-6110-sandbox-artifacts` (private): `jars/`, `storefront.tar.gz`, `app.env`, `vm/`, `scripts/` | holds the deploy artifacts and secrets file |
| Firewall | `veggo-allow-web` (tcp 80 and 443, tag `veggo-web`) | default SSH and RDP rules were deleted, so there is **no SSH** |

**What runs on the VM:** Caddy (public 80/443), the storefront (3000), the five services on 127.0.0.1:8081 to 8085, the
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
Direct Postgres connections and the Cloud SQL proxy fail from the laptop (the handshake is reset), so data moves
go through a bucket and `gcloud sql import` (see `deploy/scripts/gcp-db-migrate.ps1`, which was only syntax-checked).

## 6. Repository map

```
services/{identity,catalog,order,payment,fleet}-service/   Spring Boot services (Maven, Java 21)
storefront/                  Next.js 15, React 19, Tailwind 4, Vitest. Routes: (customer), admin, partner, restaurant
contracts/                   events/*.json (11 schemas) and CONVENTIONS.md
deploy/compose, prod         docker compose for dev and production (Caddy edge)
deploy/k8s                   Kubernetes manifests (no fleet-service yet)
deploy/gcp                   GCP sandbox README and vm/ install files
deploy/oracle                Unused Oracle Cloud notes and scripts
deploy/scripts               local-db, local-run, dev-gateway, smoke.mjs, gen-keys, gen-cloud-env, gcp-db-migrate
deploy/local                 Git-ignored: logs, pids, secrets (cloud-app.env, gcp.env)
docs/                        architecture, getting-started, deployment, observability, per-service guides, this file
.github/workflows            ci-services, ci-storefront, deploy (not yet run on GitHub)
Vegeterian_Storefront_App    Empty folder, safe to ignore
```

## 7. Configuration cheat sheet

Common env vars (see `deploy/prod/docker-compose.prod.yml` for the full list per service):
- All services: `SERVER_PORT`, `DB_URL`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_MAX`, `JWT_PUBLIC_KEY_PEM`, `INTERNAL_FEED_KEY`.
- identity: `JWT_PRIVATE_KEY_PEM`, `PII_ENC_KEY`, `PII_HMAC_KEY`, `SMS_PROVIDER`, `EMAIL_PROVIDER`, `APP_BASE_URL`, `APP_MAIN_ADMIN_EMAIL`.
- catalog: `SEED_DEMO_DATA`.
- order: `CATALOG_FEED_URL/KEY`, `PAYMENT_FEED_URL/KEY`, `FLEET_FEED_URL/KEY`, `FEED_POLL_MS`, `FEED_MAX_ATTEMPTS`.
- payment: `GATEWAY` (`razorpay` or `fake`), `ALLOW_FAKE_GATEWAY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- fleet: `ORDER_FEED_URL/KEY`, `FEED_POLL_MS`.
- Spring profiles: `json` for JSON logs in production; the cloud sandbox uses plain text logs so `smoke.mjs` can read OTPs.
- Changing `PII_ENC_KEY` or `PII_HMAC_KEY` makes existing encrypted user data unreadable.

## 8. What is verified and what is not

**Verified**
- All backend and storefront tests locally, and the smoke test locally and on the GCP VM (`SMOKE TEST PASSED`).
- On GCP: all five services healthy, HTTPS works, `X-Request-Id` is returned, `/actuator` and `/internal` return 404
  from outside, logs reach Cloud Logging.

**Not verified or untested**
- Docker, docker compose, the production Caddyfile, the GitHub workflows and the Kubernetes manifests (never run).
- The browser UI for the optional emailed admin code.
- Whether the real admin sign-up and email link flow works end to end on the cloud (the smoke test used a test admin).
- `deploy/scripts/gcp-db-migrate.ps1` (syntax-checked only). The IAM roles on the VM service account were bound but not audited.
- Real Razorpay, SMS and email providers (none connected).

## 9. Remaining work (suggested order)

1. **Buy `veggoeats.in`**, point DNS, and fill the legal details in `storefront/src/lib/brand.ts`.
2. **Real providers:** Razorpay (needs approval; set `GATEWAY=razorpay`, keep `ALLOW_FAKE_GATEWAY=false`), SMS (DLT
   registered) and an email sender. Then `SEED_DEMO_DATA=false`.
3. **Maps and restaurant data:** import restaurants from OpenStreetMap and add maps to the storefront.
4. **Notifications** (build order item that is still open).
5. **Hardening not done yet:** browser security headers (CSP), Secret Manager instead of the bucket for secrets,
   Cloud SQL private IP and IAM logins, monitoring and alerts, backup restore test, Cloudflare and rate limiting.
6. **Before running more than one instance of any service:** move rate limits and live-stream state to shared storage
   (Redis or Postgres `LISTEN/NOTIFY`).
7. **Production GCP setup:** bigger database tier with high availability and point-in-time recovery, then repeat the
   sandbox steps for production. Add fleet-service to `deploy/k8s` if Kubernetes is used.
8. Commit the pending changes (owner does this) and run the CI workflows on GitHub for the first time.

## 10. Tips for the next agent

- Read [architecture.md](architecture.md), [../contracts/CONVENTIONS.md](../contracts/CONVENTIONS.md) and
  [deployment.md](deployment.md) before changing cross-service behaviour.
- Keep services independent: no shared code, no direct calls. Add a JSON Schema to `contracts/events/` when adding or
  changing an event, and update the consumer contract tests.
- Run `local-run.ps1 down` before Maven builds. Validate each step (tests, then the smoke test) before the next one.
- Ask the owner before creating paid cloud resources, and create them as a sandbox first.
- Never print, log or commit anything from `deploy/local/*.env` or `deploy/compose/.env`.
