# identity-service (port 8081)

Phone-OTP login, RS256 JWT issuing, rotating refresh tokens, DPDP consent log and account erasure.

| | |
|---|---|
| Database | `identity` (Postgres 16), migrations in `src/main/resources/db/migration` |
| Publishes (feed) | `UserRegistered`, `UserDeleted` |
| Consumes | nothing |
| Key env | `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM`, `PII_ENC_KEY`, `PII_HMAC_KEY`, `INTERNAL_FEED_KEY`, `SMS_PROVIDER` |

Phone numbers are stored AES-256-GCM encrypted with an HMAC blind index for lookup. Dev defaults (logging SMS sender,
dev feed key) exist only under `SPRING_PROFILES_ACTIVE=local` (`application-local.yml`); without it the service fails
closed.

Packages: `api`, `service`, `persistence`, `events`, `infra.{sms,jwt,crypto}`, `config`. Full detail and API list:
[`services/identity-service/README.md`](../../services/identity-service/README.md).
