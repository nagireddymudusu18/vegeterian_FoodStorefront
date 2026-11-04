# identity-service

> **Status: untested.** Java, Maven and Docker were not installed on the machine where this service was written,
> so it has never been compiled, run, or tested. Expect to fix small compile or wiring errors on first build.

Identity microservice for the India food-delivery marketplace (port **8081**; via edge `/api/identity/*`).
Phone + OTP login, RS256 access tokens, rotating refresh tokens with reuse detection, DPDP consent records and
erasure, and an outbox event feed. Fully independent: own Postgres database, no shared library, no calls to
other services. See `contracts/CONVENTIONS.md`.

## Endpoints

| Method / path | Auth | Notes |
|---|---|---|
| `POST /auth/otp/request` `{phone, captchaToken?}` | none | Normalises Indian mobile to E.164. Rate limit: 3 / 10 min per phone, 20 / 10 min per IP (Postgres-based, counted from `otp_challenges`). Returns 202 with the same body whether or not the user exists. |
| `POST /auth/otp/verify` `{phone, code, consent:{purpose,version,granted}}` | none | 6-digit OTP, 5 min expiry, max 5 attempts, constant-time compare. Creates the user on first login (consent must be `granted: true`, emits `UserRegistered`). Returns `{accessToken, refreshToken, expiresIn}`. |
| `POST /auth/refresh` `{refreshToken}` | none | Rotates the token. Presenting an already-used token revokes the whole token family. |
| `POST /auth/logout` `{refreshToken}` | none | Revokes the token family. Idempotent, 204. |
| `POST /auth/register` `{name,email,password,consent}` | none | Always 202 (no account enumeration). Sends a verify link; 10/min per IP. |
| `POST /auth/email/verify` `{token,password}` / `POST /auth/email/resend` `{email}` | none | Single-use token (24h). Verify returns tokens. |
| `POST /auth/password/forgot` `{email}` / `POST /auth/password/reset` `{token,password}` | none | Reset link valid 30 min; reset revokes all refresh tokens. |
| `POST /me/phone/request` `{phone}` / `POST /me/phone/verify` `{phone,code}` | bearer | Adds a phone to an email account. |
| `GET /me` | Bearer | Masked phone, e.g. `+91XXXXXX1234`. |
| `POST /me/consents` `{purpose,version,granted}` | Bearer | Appends a consent record. 204. |
| `DELETE /me` | Bearer | DPDP erasure: status `DELETED`, `phone_enc` and `phone_hash` wiped, refresh tokens revoked, emits `UserDeleted`. 204. |
| `GET /.well-known/jwks.json` | none | Public key set (informational). |
| `GET /internal/events?after=&limit=` | `X-Internal-Key` | Outbox feed per CONVENTIONS (limit 1..500, default 100). 401 on missing or wrong key. Not routed by the edge. |
| `/actuator/health`, `/v3/api-docs`, `/swagger-ui.html` | none | |

Access token: RS256, 15 min, claims `iss=identity-service`, `sub=<userId>`, `roles=["CUSTOMER"]`, `iat`, `exp`.
Errors are `application/problem+json`.

Roles other than CUSTOMER are not assignable through any endpoint yet (set in the `users.roles` column directly).

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `SERVER_PORT` | `8081` | |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/identity` / `identity` / `identity` | |
| `INTERNAL_FEED_KEY` | none (`dev-internal-key` only in the `local` profile) | Shared secret for `/internal/events`. Blank = feed rejects every request. |
| `JWT_PRIVATE_KEY_PEM` | (none) | PKCS8 PEM; literal `\n` escapes allowed. |
| `JWT_PUBLIC_KEY_PEM` | derived from private key if unset | X.509 SubjectPublicKeyInfo PEM. |
| `PII_ENC_KEY` | dev default in `local` only (WARN) | base64, 32 bytes, AES-256-GCM key for the phone number. |
| `PII_HMAC_KEY` | dev default in `local` only (WARN) | base64, 32 bytes, HMAC-SHA256 key for the phone blind index and OTP hashing. |
| `SMS_PROVIDER` | none (`logging` only in the `local` profile) | `logging` logs the OTP at INFO (dev only). Without a provider the service fails to start. |
| `SPRING_PROFILES_ACTIVE` | none | Set `local` for development (dev keys, OTP logging). With no profile the service is fail-closed: missing JWT/PII keys or SMS provider abort startup. |

In the `local` profile, missing JWT keys produce an ephemeral in-memory key pair (loud WARN; tokens die on
restart and other services cannot verify them) and missing PII keys fall back to insecure fixed dev keys.

Generate keys:

```
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem     # PKCS8
openssl rsa -in private.pem -pubout -out public.pem
openssl rand -base64 32                                                           # PII_ENC_KEY / PII_HMAC_KEY
```

## Run

```
# needs Postgres with database/user/password "identity"
mvn spring-boot:run
# or
docker build -t identity-service .
docker run -p 8081:8081 -e DB_URL=jdbc:postgresql://host.docker.internal:5432/identity identity-service
```

Tests: `mvn test` (unit tests plus the Testcontainers `IdentityFlowIT`, which needs Docker and pulls `postgres:16`).

## Package layout

Base package `in.foodapp.identity` (the `IdentityApplication` entry point lives in the root).

| Package | Role |
|---|---|
| `api` | REST controllers, request/response DTOs (`Dtos`), `ApiException` and `ApiExceptionHandler` |
| `service` | Transactional use-case services (`OtpService`, `UserService`, `RefreshTokenService`, `PhoneNormalizer`) |
| `persistence` | JPA entities and Spring Data repositories |
| `events` | Outbox writing (`OutboxService`) and the `/internal/events` feed controller |
| `infra.sms` | `SmsSender` and `CaptchaVerifier` ports and their adapters |
| `infra.jwt` | JWT signing, key handling, PEM parsing |
| `infra.crypto` | PII encryption (`PiiCipher`, AES-GCM) |
| `config` | `AppProperties`, clock and security configuration |

`domain` is not used yet: there are no framework-free business rules separate from the services.

## Design notes

- Phone numbers are stored only as AES-256-GCM ciphertext (random 12-byte IV prefix) plus an HMAC-SHA256 blind
  index used for lookup and uniqueness. OTP codes are stored as keyed HMAC, never in clear.
- Outbox inserts take `pg_advisory_xact_lock(8101)` in the same transaction as the state change.
- `SmsSender` and `CaptchaVerifier` are ports. `AlwaysPassCaptchaVerifier` is a placeholder for Cloudflare Turnstile.
- Access tokens already issued remain valid until expiry after `DELETE /me`, but `/me` returns 404 and refresh fails.


Config: `EMAIL_PROVIDER` (`logging` for local), `APP_BASE_URL`. Migration V3 adds `users.email_verified` and `email_tokens`.

## Feature flags

Migration V4 adds eature_flags. Endpoints: public GET /flags, admin GET /admin/flags, PUT /admin/flags/{key}, and POST /admin/restaurant-owners {email} (grants the RESTAURANT role to a verified account and returns its userId; the admin then sets that id as ownerUserId on the restaurant in catalog). Config: APP_MAIN_ADMIN_EMAIL (one email; verified email accounts only; gets ADMIN and SUPER_ADMIN; replaces the old APP_ADMIN_EMAILS list). otp_login and email_registration are enforced server-side.

Admin team (migration V5): admins sign in only through POST /auth/admin/login (email and password; phone OTP, /auth/login and the email-verify sign-in never return admin roles). With the admin_login_code flag on, that call returns a challengeId and the code emailed to the admin is exchanged at POST /auth/admin/login/verify (single use, 10 minutes, 5 attempts). Refresh tokens remember whether they came from the admin sign-in (refresh_tokens.admin_session); only those keep admin roles when refreshed. The main admin manages the team under /admin/team (SUPER_ADMIN only): GET the team, POST /invites {email} (emails a 7-day single-use link), DELETE /invites/{id}, DELETE /members/{userId}. The invitee redeems the link with POST /auth/admin/invite/accept {token, email, password}. Granting or removing admin revokes the person's refresh tokens; access tokens already issued last up to 15 minutes. The main admin and yourself cannot be removed.

