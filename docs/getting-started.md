# Getting started

## Prerequisites
| Tool | Version | Needed for |
|---|---|---|
| JDK | 21 | building and running the services outside Docker |
| Maven | 3.9+ | same (Docker images build with Maven in a container, so it is optional for `docker compose`) |
| Node.js | 22 | storefront |
| Docker Desktop | recent | `docker compose`, Testcontainers integration tests (or use the Docker-free setup below) |
| GNU make | any | optional, only for the root `Makefile` shortcuts |

On Windows, `make` is not installed by default: `choco install make`, `scoop install make`, or use Git Bash.
Every Makefile target is a thin wrapper, so the plain commands below always work.

Behind a corporate TLS-inspecting proxy, Maven may fail with a PKIX error. Set
`MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` (certificate validation stays on).

## Run the whole stack
```powershell
node deploy/scripts/gen-keys.mjs      # make setup   -> writes deploy/compose/.env (git-ignored dev secrets)
cd deploy/compose
docker compose up --build             # make up
```
Open http://localhost:8080. Login OTPs are printed in the `identity-service` container logs. The fake payment gateway
fails on purpose when the amount in paise ends in 13.

## Run the whole stack without Docker (Windows, no admin rights)
For machines where Docker Desktop cannot be installed. It uses a portable PostgreSQL 16 plus the PostGIS bundle
unzipped under `%USERPROFILE%\tools\pgsql` (data in `%USERPROFILE%\tools\pgdata`), the services as plain jars, a small
Node gateway on :8080 in place of Caddy, and `npm run dev` for the storefront. JDK 21, Maven and Node must be on PATH.
```powershell
deploy/scripts/local-db.ps1 init      # once: initdb, starts Postgres, creates the 4 roles/databases and PostGIS
deploy/scripts/local-run.ps1 build    # mvn package for each service (stack must be down: running jars are locked)
deploy/scripts/local-run.ps1 up       # services :8081-8086, gateway :8080, storefront :3000
node deploy/scripts/smoke.mjs         # login -> order -> fake payment -> PAID, incl. the live status stream
deploy/scripts/local-run.ps1 status | down
deploy/scripts/local-db.ps1 start | stop | status
```
Logs and pid files are in `deploy/local/` (git-ignored); login OTPs appear in `deploy/local/identity-service.log`.
Local DB users and passwords equal the service names and Postgres uses trust auth on 127.0.0.1 only: dev use only.

Integration tests can use the same server instead of Testcontainers. Each test JVM creates and drops its own
`test_<service>_<random>` database:
```powershell
$env:TEST_DB_URL = "jdbc:postgresql://127.0.0.1:5432/postgres"; $env:TEST_DB_USER = "postgres"; $env:TEST_DB_PASSWORD = ""
mvn -B verify      # in each services/<name>, with the stack down
```
Windows notes: start Postgres only through `local-db.ps1` (it detaches the server from the console; a server started
inside a tool/background task dies with it), and if a backend fails once with "could not reserve shared memory region
(error 487)" just retry. `docker compose` itself is not exercised by this setup.

## Run one service without Docker for the app
Start only its database, then run the service with the `local` profile (dev-only defaults such as the feed key and the
logging SMS sender are enabled by that profile and nowhere else):
```powershell
cd deploy/compose; docker compose up -d catalog-db
cd ../../services/catalog-service
$env:SPRING_PROFILES_ACTIVE = "local"
mvn spring-boot:run
```
Each service also needs `JWT_PUBLIC_KEY_PEM` (copy it from `deploy/compose/.env`) to validate tokens.

## Tests
```powershell
make test        # unit tests, no Docker needed
make verify      # also runs the Testcontainers integration tests (Docker required)
make lint        # storefront lint
```
Without make: `mvn -B test` in each `services/<name>` and `npm test` / `npm run lint` in `storefront/`.

## Sign-in, guest checkout and order tracking
- **Guest checkout:** in checkout, a signed-out visitor enters name and phone, accepts the terms and verifies an OTP. This creates a normal customer account, so no separate guest model exists. The name is stored encrypted.
- **Registration:** `/login` has three tabs: phone OTP, email and password, and create account. `POST /auth/register` and `POST /auth/login` (identity-service) back the email options. Passwords need 8+ characters with a letter and a digit, are hashed with BCrypt, and 5 failed logins lock the account for 15 minutes. An OTP account can add an email and password from the profile page (`POST /me/credentials`).
- **Email verification and password reset:** `POST /auth/register` always answers 202 (it never reveals whether an address exists) and sends a verification link; login returns 403 until the address is verified. Also `POST /auth/email/verify` (`{token,password}`: the verify page asks for the password chosen at sign-up, so a link sent to a victim of someone else's sign-up cannot hand over the account), `/auth/email/resend`, `/auth/password/forgot`, `/auth/password/reset` (reset revokes all sessions). Locally `EMAIL_PROVIDER=logging` prints the links to `deploy/local/identity-service.log` as `[EMAIL_PROVIDER=logging] VERIFY_EMAIL to <email>: <link>`; open the link in the browser. Set `APP_BASE_URL` to the public storefront URL; a real provider is a later swap behind `EmailSender`.
- **Add a phone to an email account:** profile page, `POST /me/phone/request` then `/me/phone/verify` (OTP).
- **Cuisine:** restaurants have an optional `cuisine` (catalog migration V2); the home page builds category chips from it. On an existing local DB the seed does not re-run, so set it with SQL or the owner API.
- **Tracking:** every order gets a number such as `FA-7K3M9-QX2RA` (50 random bits). `GET /orders/track/{orderNumber}` is public, rate limited to 30 requests a minute per IP, and returns no personal data. The storefront page is `/track`.
- **Local testing:** `node deploy/scripts/smoke.mjs` covers OTP with name, register, login, order, payment, the live stream and public tracking.
- Rate limits and lockout counters are in memory, so they are per instance.

## Where to look next
- [architecture.md](architecture.md): how the pieces fit and why they are independent
- [services/](services/): one guide per service
- [../contracts/CONVENTIONS.md](../contracts/CONVENTIONS.md): the cross-service contract (ports, auth, feed, events, env vars)
- [../deploy/k8s/README.md](../deploy/k8s/README.md): deploying to another cloud

## Areas and feature flags

The storefront has three areas: customer (`/`, `/cart`, `/orders`, ... in the `(customer)` route group, URLs unchanged), admin (`/admin`) and delivery partner (`/partner`, hidden until the `delivery_module` flag is on).

**Admin access.** Administrators sign in with email and password only, at `/admin/login`. Phone OTP and the ordinary `/login` refuse admin accounts. Set `APP_MAIN_ADMIN_EMAIL` on identity-service (the local stack uses `admin@foodapp.local`): register that email, verify it via the link in `deploy/local/identity-service.log`, then sign in at `/admin/login`. That one account is the main admin (roles `ADMIN` and `SUPER_ADMIN`). Only it can open `/admin/team` to invite other admins by email: the invitee creates and verifies an account with that address, opens the invite link (`/admin/accept?token=...`, in the log locally) and confirms with their password. The main admin can revoke invites and remove admins; the main admin itself cannot be removed. Turn on the `admin_login_code` flag to also require a 6-digit emailed code at admin sign-in (off by default; locally the code is in the log).

| Flag | Default | Enforced |
|------|---------|----------|
| `otp_login` | on | identity-service (503 when off) |
| `email_registration` | on | identity-service (503 when off) |
| `guest_checkout` | on | storefront only |
| `order_tracking` | on | storefront only |
| `live_order_updates` | on | storefront only |
| `delivery_module` | off | storefront only |
| `admin_login_code` | off | identity-service (emailed code at admin sign-in) |

Public `GET /flags`; admin `GET /admin/flags`, `PUT /admin/flags/{key}` with `{"enabled":true}`. Clients read flags on load, so changes apply on next page load. Client-only flags are UI gates because order-service stays independent of identity.
