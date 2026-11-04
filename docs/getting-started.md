# Getting started

The app runs on Google Cloud (see [../deploy/gcp/README.md](../deploy/gcp/README.md)); there is no supported "run it all
on the laptop" setup. A developer machine is only used to edit code, build, and upload artifacts.

## Prerequisites
| Tool | Version | Needed for |
|---|---|---|
| JDK | 21 | building the service jars (`mvn package`) |
| Maven | 3.9+ | same |
| Node.js | 22 | building the storefront (`npm run build`), lint and unit tests |
| gcloud CLI | recent | uploading artifacts to the bucket and starting/stopping the VM and Cloud SQL |

Behind a corporate TLS-inspecting proxy, Maven may fail with a PKIX error. Set
`MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` (certificate validation stays on). gcloud needs the session
helper described in `PROJECT_HANDOVER.md` section 5.

## Build and deploy to the sandbox
1. Build every service: `mvn -B -DskipTests package` in each `services/<name>-service`. Every jar is
   `target/<name>-service.jar`; upload each to the bucket as `jars/<name>.jar` (without `-service`).
2. Build the storefront with the sandbox URL baked in and upload it:
   `NEXT_PUBLIC_API_BASE=https://<host> npm run build` in `storefront/`. Package `.next/standalone/*` (so `server.js`
   is at the archive root) together with `.next/static` (as `.next/static`) and `public/` as `storefront.tar.gz`.
3. Regenerate secrets only when needed: `node deploy/scripts/gen-cloud-env.mjs --host <host> --admin <email> --keep-keys`
   (writes the git-ignored `deploy/local/cloud-app.env`; upload it as `app.env`).
4. Reset the VM so the startup script reinstalls and restarts everything:
   `gcloud compute instances reset veggo-sandbox-vm --zone=asia-south1-a`.

The full runbook, resource names, costs and the stop/start commands are in
[../deploy/gcp/README.md](../deploy/gcp/README.md).

## Tests
GitHub Actions runs everything on every push and pull request (`ci-java-services`, `ci-storefront`). Locally:
```powershell
cd storefront; npm ci; npm run lint; npm test; npm run build        # no database needed
cd services/<name>-service; mvn -B test                              # unit tests, no database needed
cd services/<name>-service; mvn -B verify                            # also integration tests: Docker (Testcontainers)
```
Without Docker, point the integration tests at any reachable Postgres. Each test JVM creates and drops its own
`test_<service>_<random>` database:
```powershell
$env:TEST_DB_URL = "jdbc:postgresql://127.0.0.1:5432/postgres"; $env:TEST_DB_USER = "postgres"; $env:TEST_DB_PASSWORD = ""
mvn -B verify
```
(catalog-service also needs PostGIS in that Postgres.)

## Smoke test
`deploy/scripts/smoke.mjs` is an end-to-end check (OTP sign-up, email register/verify/reset, order, fake payment, live
stream, public tracking, admin team, fleet delivery, notifications). The VM runs it once after a deploy when
`RUN_SMOKE=1` is in `app.env` (`gen-cloud-env.mjs --smoke`); its output is in `/opt/veggo/deploy/local/smoke.log` and
Cloud Logging.

## Sign-in, guest checkout and order tracking
- **Guest checkout:** in checkout, a signed-out visitor enters name and phone, accepts the terms and verifies an OTP. This creates a normal customer account, so no separate guest model exists. The name is stored encrypted.
- **Registration:** `/login` has three tabs: phone OTP, email and password, and create account. `POST /auth/register` and `POST /auth/login` (identity-service) back the email options. Passwords need 8+ characters with a letter and a digit, are hashed with BCrypt, and 5 failed logins lock the account for 15 minutes. An OTP account can add an email and password from the profile page (`POST /me/credentials`).
- **Email verification and password reset:** `POST /auth/register` always answers 202 (it never reveals whether an address exists) and sends a verification link; login returns 403 until the address is verified. Also `POST /auth/email/verify` (`{token,password}`: the verify page asks for the password chosen at sign-up, so a link sent to a victim of someone else's sign-up cannot hand over the account), `/auth/email/resend`, `/auth/password/forgot`, `/auth/password/reset` (reset revokes all sessions). On the sandbox `EMAIL_PROVIDER=logging` writes the links to the identity log (Cloud Logging, log `veggo`) as `[EMAIL_PROVIDER=logging] VERIFY_EMAIL to <email>: <link>`; open the link in the browser. Set `APP_BASE_URL` to the public storefront URL; a real provider is a later swap behind `EmailSender`.
- **Add a phone to an email account:** profile page, `POST /me/phone/request` then `/me/phone/verify` (OTP).
- **Cuisine:** restaurants have an optional `cuisine` (catalog migration V2); the home page builds category chips from it. The demo seed does not re-run on an existing database, so set it with SQL or the owner API.
- **Tracking:** every order gets a number such as `FA-7K3M9-QX2RA` (50 random bits). `GET /orders/track/{orderNumber}` is public, rate limited to 30 requests a minute per IP, and returns no personal data. The storefront page is `/track`.
- Rate limits and lockout counters are in memory, so they are per instance.

## Where to look next
- [architecture.md](architecture.md): how the pieces fit and why they are independent
- [services/](services/): one guide per service
- [../contracts/CONVENTIONS.md](../contracts/CONVENTIONS.md): the cross-service contract (ports, auth, feed, events, env vars)

## Areas and feature flags

The storefront has three areas: customer (`/`, `/cart`, `/orders`, ... in the `(customer)` route group, URLs unchanged), admin (`/admin`) and delivery partner (`/partner`, hidden until the `delivery_module` flag is on).

**Admin access.** Administrators sign in with email and password only, at `/admin/login`. Phone OTP and the ordinary `/login` refuse admin accounts. Set `APP_MAIN_ADMIN_EMAIL` on identity-service (`gen-cloud-env.mjs --admin <email>`): register that email, verify it via the link in the log, then sign in at `/admin/login`. That one account is the main admin (roles `ADMIN` and `SUPER_ADMIN`). Only it can open `/admin/team` to invite other admins by email: the invitee creates and verifies an account with that address, opens the invite link (`/admin/accept?token=...`, in the log) and confirms with their password. The main admin can revoke invites and remove admins; the main admin itself cannot be removed. Turn on the `admin_login_code` flag to also require a 6-digit emailed code at admin sign-in (off by default; the code is in the log).
