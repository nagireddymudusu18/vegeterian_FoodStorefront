# catalog-service

Restaurant and menu catalog for the India food-delivery marketplace (port **8082**, edge path `/api/catalog/*`).
Owns restaurants (FSSAI number, kitchen certification tier, location, delivery radius), menu items (price in
paise, pure-veg / vegan / Jain flags, ingredients, allergens, availability), PostGIS geofenced search, and the
`outbox` event feed other services poll.

> **Status: untested.** The toolchain (Java, Maven, Docker) was not installed on the machine where this service
> was written, so it has **never been compiled or run**. Expect to fix small compile or runtime issues on first
> build.

## Stack
Java 21, Spring Boot 3.3.x, Spring Data JPA (Hibernate 6), native SQL for PostGIS (`ST_DWithin`, `ST_Distance`
on a `geography` column kept in sync by a trigger), Flyway, Spring Security resource server (RS256 JWT, validated
locally), springdoc-openapi, Testcontainers (`postgis/postgis:16-3.4`).

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/restaurants?lat&lng&radiusMeters=5000&diet=PURE_VEG\|VEGAN\|JAIN&q=` | public | Open restaurants whose own `delivery_radius_meters` covers the point and within `radiusMeters`; sorted by distance; each has `distanceMeters`. `diet` keeps restaurants with at least one available matching item; `q` is full text over restaurant and item names. |
| GET | `/restaurants/{id}` | public | Restaurant with full menu |
| GET | `/restaurants/{id}/menu?diet=` | public | Menu (unavailable items included, flagged `available:false`) |
| POST | `/restaurants` | RESTAURANT or ADMIN | Caller becomes owner (ADMIN may pass `ownerUserId`) |
| PUT | `/restaurants/{id}` | owner or ADMIN | 403 for other restaurant accounts |
| POST | `/restaurants/{id}/items` | owner or ADMIN | Diet rules validated, 422 on violation |
| PUT | `/items/{id}` | owner or ADMIN | |
| PATCH | `/items/{id}/availability` | owner or ADMIN | Body `{"available":false}` (the "86" toggle) |
| GET | `/internal/events?after=0&limit=100` | header `X-Internal-Key` | Outbox feed per `contracts/CONVENTIONS.md`; 401 on bad key. Not routed by the edge. |
| GET | `/actuator/health`, `/swagger-ui.html`, `/v3/api-docs` | public | |

Roles come from the JWT `roles` claim (`RESTAURANT`, `ADMIN`); `sub` is the user id. Errors are
`application/problem+json`.

Events written to the outbox in the same transaction as the change (with `pg_advisory_xact_lock` before insert):
`RestaurantUpserted`, `MenuItemUpserted`, `MenuItemAvailabilityChanged`. `RestaurantUpserted` carries
`ownerUserId` (UUID, nullable) so consumers such as order-service can authorize restaurant staff per restaurant.

Diet rules (`in.foodapp.catalog.domain.DietRules`, framework-free): vegan and Jain imply pure-veg; pure-veg forbids
meat, fish, egg, gelatin, carmine, rennet, bone char; vegan additionally forbids dairy, ghee, honey; Jain
additionally forbids onion, garlic, potato, carrot, radish, beet, ginger, turnip, mushroom and similar. Matching is
word based and ignores plant qualifiers (e.g. "coconut milk", "peanut butter").

## Package layout
Base package `in.foodapp.catalog` (`CatalogServiceApplication` lives in the root).

| Package | Role |
|---|---|
| `api` | REST controllers, request/response DTOs, `ApiExceptionHandler` (problem+json) |
| `service` | Use-case orchestration and transactions (`CatalogService`, `Caller`) |
| `domain` | Framework-free rules, enums and domain exceptions (`DietRules`, `Diet`, ...) |
| `persistence` | JPA entities, Spring Data repositories, PostGIS `RestaurantSearchRepository` |
| `events` | Outbox writer (`OutboxService`) and the `/internal/events` feed controller |
| `config` | Spring configuration: `SecurityConfig`, `DevSeedData` demo seeder |

## Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `SERVER_PORT` | `8082` | HTTP port |
| `DB_URL` | `jdbc:postgresql://localhost:5432/catalog` | JDBC URL (needs PostGIS) |
| `DB_USER` / `DB_PASSWORD` | `catalog` / `catalog` | DB credentials |
| `INTERNAL_FEED_KEY` | `dev-internal-key` | Expected `X-Internal-Key` |
| `JWT_PUBLIC_KEY_PEM` | empty | RSA public key (X.509 PEM, `\n` escapes allowed). If empty, all tokens are rejected but public GETs work. |
| `SEED_DEMO_DATA` | `true` | Seed 4 Bengaluru demo restaurants (about 6 items each) when the DB is empty. Set `false` in production. |
| `JAVA_OPTS` | `-XX:MaxRAMPercentage=70` | JVM flags (Docker) |

## Run
```
docker build -t catalog-service .
docker run --rm -p 8082:8082 -e DB_URL=jdbc:postgresql://host.docker.internal:5432/catalog \
  -e JWT_PUBLIC_KEY_PEM="$(cat jwt-public.pem)" catalog-service
```
Local database: `docker run -e POSTGRES_DB=catalog -e POSTGRES_USER=catalog -e POSTGRES_PASSWORD=catalog -p 5432:5432 postgis/postgis:16-3.4`.

Build and test (once Maven 3.9+ and JDK 21 are installed; the integration test needs Docker):
```
mvn verify
```

## Tests
- `DietRulesTest`: pure unit tests of the diet rules.
- `CatalogIntegrationTest`: Testcontainers PostGIS; geofence boundary (4,990 m in, 5,010 m out, plus 4,900 / 5,100;
  exactly 5,000 m is deliberately not asserted because of sub-metre spheroid rounding), distance ordering,
  diet/full-text filters, 422 problem+json, owner/admin/role authorization (403/401), feed cursor paging and key
  rejection.

Restaurants carry an optional cuisine (max 40 chars, migration V2), returned in search and used for the storefront home categories.
