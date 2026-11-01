# Veggo Eats: food marketplace (India)

On-demand food marketplace for Pure Veg, Vegan and Jain customers. The backend is a set of **fully independent Spring
Boot microservices** (own database, no shared code, no service-to-service calls); services exchange data only through
pull-based event feeds (Postgres outbox). See `contracts/CONVENTIONS.md`.

| Piece | Path | Port (on the VM) |
|---|---|---|
| identity-service (OTP and email login, JWT, roles, admin team, DPDP consent/erasure) | `services/identity-service` | 8081 |
| catalog-service (restaurants, menus, diet filters, geo search) | `services/catalog-service` | 8082 |
| order-service (cart pricing, order state machine, live status) | `services/order-service` | 8083 |
| payment-service (fake gateway, Razorpay stub, ledger) | `services/payment-service` | 8084 |
| fleet-service (delivery partners, job pool) | `services/fleet-service` | 8085 |
| notification-service (in-app inbox, email, SMS) | `services/notification-service` | 8086 |
| web storefront (Next.js) | `storefront` | 3000 |
| edge proxy (Caddy, HTTPS) | `deploy/gcp/vm/Caddyfile` | 80 / 443 |

## Where it runs
Everything runs on Google Cloud (a sandbox first): one VM with the services as systemd units, Cloud SQL for the
databases, Caddy in front. Nothing needs to run on a developer machine. See
[`deploy/gcp/README.md`](deploy/gcp/README.md) for the resources, how a deploy works and how to start and stop it, and
[`docs/PROJECT_HANDOVER.md`](docs/PROJECT_HANDOVER.md) for the full picture.

## Documentation
Start with `docs/README.md` (getting started, architecture, one guide per service).

## Tests
GitHub Actions runs them on every push and pull request: `ci-java-services` (`mvn verify` per changed service, with
Testcontainers Postgres, plus a Docker image build) and `ci-storefront` (lint, tests, build). To run a service's tests
yourself you need JDK 21, Maven and either Docker or a Postgres reachable through `TEST_DB_URL`
(see `docs/getting-started.md`).

## Status
Dispatch/fleet and notifications (in-app inbox, email, SMS) are built; email and SMS use logging providers until real
ones are connected. Not yet built: live payment gateway (pending merchant approval), real SMS (pending DLT
registration), real email sender.
