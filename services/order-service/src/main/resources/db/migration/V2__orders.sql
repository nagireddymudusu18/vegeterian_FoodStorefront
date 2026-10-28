CREATE TABLE orders (
    id                UUID PRIMARY KEY,
    customer_id       UUID        NOT NULL,
    restaurant_id     UUID        NOT NULL,
    status            VARCHAR(32) NOT NULL,
    subtotal_paise    BIGINT      NOT NULL,
    tax_paise         BIGINT      NOT NULL,
    delivery_fee_paise BIGINT     NOT NULL,
    total_paise       BIGINT      NOT NULL,
    -- 4-digit delivery OTP. Stored in clear (not hashed) because it must be shown to the customer while
    -- the order is PICKED_UP; a 4-digit value is trivially brute-forceable from a hash anyway, so the
    -- real protection is the per-order attempt limit. Cleared on DELIVERED.
    delivery_otp      VARCHAR(8),
    otp_attempts      INTEGER     NOT NULL DEFAULT 0,
    was_paid          BOOLEAN     NOT NULL DEFAULT FALSE,
    idempotency_key   VARCHAR(128),
    version           BIGINT      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
CREATE UNIQUE INDEX uq_orders_customer_idempotency
    ON orders (customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE order_items (
    id               BIGSERIAL PRIMARY KEY,
    order_id         UUID    NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    item_id          UUID    NOT NULL,
    name             TEXT    NOT NULL,
    unit_price_paise BIGINT  NOT NULL,
    quantity         INTEGER NOT NULL,
    line_total_paise BIGINT  NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE order_events (
    id           BIGSERIAL PRIMARY KEY,
    order_id     UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    from_status  VARCHAR(32),
    to_status    VARCHAR(32) NOT NULL,
    reason       TEXT,
    at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON order_events (order_id, id);
