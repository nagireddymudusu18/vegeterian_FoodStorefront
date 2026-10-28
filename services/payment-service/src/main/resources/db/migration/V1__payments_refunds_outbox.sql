-- payments: one row per customer payment attempt for an order.
CREATE TABLE payments (
    id               UUID PRIMARY KEY,
    order_id         UUID         NOT NULL,
    customer_id      UUID         NOT NULL,
    amount_paise     BIGINT       NOT NULL CHECK (amount_paise > 0),
    currency         VARCHAR(3)   NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    status           VARCHAR(16)  NOT NULL CHECK (status IN ('CREATED', 'CAPTURED', 'FAILED', 'REFUNDED')),
    gateway          VARCHAR(32)  NOT NULL,
    gateway_ref      VARCHAR(128),
    failure_reason   TEXT,
    idempotency_key  VARCHAR(128) NOT NULL,
    request_hash     VARCHAR(64)  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version          BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_payments_customer_idem UNIQUE (customer_id, idempotency_key)
);
CREATE INDEX idx_payments_order ON payments (order_id);
CREATE INDEX idx_payments_gateway_ref ON payments (gateway_ref);

-- webhook_events: raw inbound gateway events; unique event id gives dedupe.
CREATE TABLE webhook_events (
    id                BIGSERIAL PRIMARY KEY,
    gateway_event_id  VARCHAR(128) NOT NULL,
    event_type        VARCHAR(64),
    payload           JSONB        NOT NULL,
    received_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    processed         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_webhook_event UNIQUE (gateway_event_id)
);

-- refunds
CREATE TABLE refunds (
    id               UUID PRIMARY KEY,
    payment_id       UUID         NOT NULL REFERENCES payments (id),
    amount_paise     BIGINT       NOT NULL CHECK (amount_paise > 0),
    status           VARCHAR(16)  NOT NULL CHECK (status IN ('PROCESSED', 'FAILED')),
    gateway_ref      VARCHAR(128),
    idempotency_key  VARCHAR(128) NOT NULL,
    request_hash     VARCHAR(64)  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_refunds_payment_idem UNIQUE (payment_id, idempotency_key)
);
CREATE INDEX idx_refunds_payment ON refunds (payment_id);

-- outbox per CONVENTIONS.md
CREATE TABLE outbox (
    id            BIGSERIAL PRIMARY KEY,
    type          TEXT        NOT NULL,
    aggregate_id  UUID        NOT NULL,
    payload       JSONB       NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
