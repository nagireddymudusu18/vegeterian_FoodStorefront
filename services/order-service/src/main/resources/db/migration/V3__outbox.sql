CREATE TABLE outbox (
    id           BIGSERIAL PRIMARY KEY,
    type         TEXT        NOT NULL,
    aggregate_id UUID        NOT NULL,
    payload      JSONB       NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
