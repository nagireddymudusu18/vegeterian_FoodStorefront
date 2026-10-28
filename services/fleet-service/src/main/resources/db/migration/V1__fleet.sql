-- A delivery partner: the identity-service user id plus rider details.
CREATE TABLE partners (
    user_id     UUID PRIMARY KEY,
    name        TEXT        NOT NULL,
    vehicle     TEXT        NOT NULL,
    online      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One delivery job per order; created when order-service reports PREPARING.
CREATE TABLE deliveries (
    order_id         UUID PRIMARY KEY,
    order_number     TEXT        NOT NULL,
    restaurant_id    UUID        NOT NULL,
    restaurant_name  TEXT,
    status           VARCHAR(16) NOT NULL
        CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED')),
    partner_id       UUID REFERENCES partners (user_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_at      TIMESTAMPTZ
);
CREATE INDEX idx_deliveries_status ON deliveries (status, created_at);
CREATE INDEX idx_deliveries_partner ON deliveries (partner_id, status);

CREATE TABLE outbox (
    id           BIGSERIAL PRIMARY KEY,
    type         TEXT        NOT NULL,
    aggregate_id UUID        NOT NULL,
    payload      JSONB       NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feed_cursor (
    source   TEXT PRIMARY KEY,
    last_id  BIGINT NOT NULL DEFAULT 0
);