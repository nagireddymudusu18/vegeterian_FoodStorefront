# Food Marketplace (India)

On-demand food marketplace with dietary classification (Pure Veg / Vegan / Jain). Backend is a set of **fully
independent Spring Boot microservices** (own database, no shared code, no service-to-service calls); services
exchange data only through pull-based event feeds (Postgres outbox). See `contracts/CONVENTIONS.md`.

| Piece | Path | Port |
|---|---|---|
| identity-service (OTP login, JWT, DPDP consent/erasure) | `services/identity-service` | 8081 |
| catalog-service (restaurants, menus, diet filters, geo search) | `services/catalog-service` | 8082 |
| order-service (cart pricing, order state machine) | `services/order-service` | 8083 |
| payment-service (SKELETON: fake gateway, Razorpay stub, ledger) | `services/payment-service` | 8084 |
| web storefront (Next.js) | `storefront` | 3000 |
| edge proxy (Caddy) | `deploy/compose` | 8080 |

## Documentation
Start with `docs/README.md` (getting started, architecture, one guide per service). `make help` lists the helper
commands (needs GNU make; on Windows `choco install make` or use Git Bash).

## Prerequisites
JDK 21, Docker Desktop, Node 22. Maven is optional (the Dockerfiles build with Maven in a container).

## Run everything locally
```powershell
node deploy/scripts/gen-keys.mjs          # creates deploy/compose/.env with dev secrets (git-ignored)
cd deploy/compose
docker compose up --build
```
Open http://localhost:8080. Login OTPs are printed in the `identity-service` container logs.
Payments use the fake gateway (an amount ending in 13 paise fails on purpose).

No Docker (e.g. a locked-down Windows laptop)? See "Run the whole stack without Docker" in `docs/getting-started.md`
(`deploy/scripts/local-db.ps1` and `local-run.ps1`).

## Run one service alone
Each service needs only its own Postgres; e.g. `docker compose up identity-db identity-service`. Producers being
down never stops a consumer from starting.

## Other clouds
`deploy/k8s/base` has Kustomize manifests (bring your own managed Postgres with PostGIS for catalog).

## Status
Milestone 1 skeleton (order status updates are pushed live over SSE). Dispatch/fleet and notifications (in-app inbox,
email, SMS) are built; email and SMS use logging providers until real ones are connected. Not yet built: live payment
gateway (pending merchant approval), real SMS (pending DLT registration), real email sender.
