-- Local read-replicas of catalog data, fed by the catalog-service event feed.
-- source_event_id = catalog outbox id of the last applied event; older events are ignored (stale).
CREATE TABLE restaurant_replica (
    restaurant_id                UUID PRIMARY KEY,
    name                         TEXT             NOT NULL,
    lat                          DOUBLE PRECISION NOT NULL DEFAULT 0,
    lng                          DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_open                      BOOLEAN          NOT NULL DEFAULT FALSE,
    delivery_radius_meters       INTEGER          NOT NULL DEFAULT 0,
    kitchen_certification_level  TEXT,
    fssai_number                 TEXT,
    source_event_id              BIGINT           NOT NULL,
    updated_at                   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE TABLE menu_item_replica (
    item_id          UUID PRIMARY KEY,
    restaurant_id    UUID        NOT NULL,
    name             TEXT        NOT NULL,
    price_paise      BIGINT      NOT NULL,
    is_pure_veg      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_vegan         BOOLEAN     NOT NULL DEFAULT FALSE,
    is_jain          BOOLEAN     NOT NULL DEFAULT FALSE,
    available        BOOLEAN     NOT NULL DEFAULT TRUE,
    source_event_id  BIGINT      NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_item_replica_restaurant ON menu_item_replica (restaurant_id);

-- Per-producer consumer cursor (CONVENTIONS: feed_cursor(source TEXT PK, last_id BIGINT)).
CREATE TABLE feed_cursor (
    source   TEXT PRIMARY KEY,
    last_id  BIGINT NOT NULL DEFAULT 0
);
