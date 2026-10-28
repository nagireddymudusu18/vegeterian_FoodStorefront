CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE restaurants (
    id                          UUID PRIMARY KEY,
    name                        TEXT             NOT NULL,
    fssai_number                TEXT             NOT NULL,
    kitchen_certification_level TEXT             NOT NULL
        CHECK (kitchen_certification_level IN ('TIER_1_EXCLUSIVE_VEG', 'TIER_2_SEGREGATED_KITCHEN')),
    lat                         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng                         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    geog                        geography(Point, 4326),
    delivery_radius_meters      INTEGER          NOT NULL CHECK (delivery_radius_meters > 0),
    open                        BOOLEAN          NOT NULL DEFAULT TRUE,
    owner_user_id               UUID,
    search_vector               tsvector,
    created_at                  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    version                     BIGINT           NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
    id                 UUID PRIMARY KEY,
    restaurant_id      UUID        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    name               TEXT        NOT NULL,
    description        TEXT,
    price_paise        BIGINT      NOT NULL CHECK (price_paise >= 0),
    is_pure_veg        BOOLEAN     NOT NULL DEFAULT FALSE,
    is_vegan           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_jain            BOOLEAN     NOT NULL DEFAULT FALSE,
    contains_allergens TEXT[]      NOT NULL DEFAULT '{}',
    ingredients        TEXT[]      NOT NULL DEFAULT '{}',
    available          BOOLEAN     NOT NULL DEFAULT TRUE,
    search_vector      tsvector,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    version            BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE outbox (
    id           BIGSERIAL PRIMARY KEY,
    type         TEXT        NOT NULL,
    aggregate_id UUID        NOT NULL,
    payload      JSONB       NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_restaurants_geog ON restaurants USING GIST (geog);
CREATE INDEX idx_restaurants_search ON restaurants USING GIN (search_vector);
CREATE INDEX idx_menu_items_search ON menu_items USING GIN (search_vector);
CREATE INDEX idx_menu_items_restaurant ON menu_items (restaurant_id);
CREATE INDEX idx_restaurants_owner ON restaurants (owner_user_id);

CREATE FUNCTION restaurants_derive() RETURNS trigger AS $$
BEGIN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
    NEW.search_vector := to_tsvector('simple', coalesce(NEW.name, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurants_derive
    BEFORE INSERT OR UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION restaurants_derive();

CREATE FUNCTION menu_items_derive() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_menu_items_derive
    BEFORE INSERT OR UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION menu_items_derive();
