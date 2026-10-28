# catalog-service (port 8082)

Restaurants, menu items, dietary flags (Pure Veg / Vegan / Jain), geo and dish search.

| | |
|---|---|
| Database | `catalog` (`postgis/postgis:16-3.4`) |
| Publishes (feed) | `RestaurantUpserted` (includes `ownerUserId`), `MenuItemUpserted`, `MenuItemAvailabilityChanged` |
| Consumes | nothing |
| Key env | `JWT_PUBLIC_KEY_PEM`, `INTERNAL_FEED_KEY`, `SEED_DEMO_DATA` (default `false`) |

Diet rules live in the `domain` package (vegan implies no dairy/ghee/honey; Jain implies no root vegetables). Search
uses PostGIS `ST_DWithin` and Postgres full-text. Demo data is seeded only when `SEED_DEMO_DATA=true`.

Packages: `api`, `service`, `domain`, `persistence`, `events`, `config`. Full detail:
[`services/catalog-service/README.md`](../../services/catalog-service/README.md).
