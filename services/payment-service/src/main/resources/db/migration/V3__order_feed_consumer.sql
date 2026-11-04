-- payment-service now also consumes order-service's feed (CONVENTIONS "Event feed"), to refund captured
-- payments when an order is cancelled or rejected.
CREATE TABLE feed_cursor (
    source   TEXT   PRIMARY KEY,
    last_id  BIGINT NOT NULL
);

-- Retry counting for feed events that fail, and a dead-letter table for events that keep failing or are malformed,
-- so one bad event never blocks the feed.
CREATE TABLE feed_failure (
    source      TEXT        NOT NULL,
    event_id    BIGINT      NOT NULL,
    attempts    INT         NOT NULL,
    last_error  TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, event_id)
);

CREATE TABLE feed_dead_letter (
    id            BIGSERIAL PRIMARY KEY,
    source        TEXT        NOT NULL,
    event_id      BIGINT      NOT NULL,
    event_type    TEXT,
    aggregate_id  UUID,
    payload       JSONB,
    error         TEXT        NOT NULL,
    attempts      INT         NOT NULL,
    parked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ,
    resolution    TEXT,
    UNIQUE (source, event_id)
);
CREATE INDEX feed_dead_letter_open_idx ON feed_dead_letter (parked_at) WHERE resolved_at IS NULL;

-- Orders that were cancelled or rejected, as told by the order feed. A payment captured AFTER its order closed
-- (for example a slow gateway) is refunded as soon as it is captured.
CREATE TABLE closed_order (
    order_id   UUID        PRIMARY KEY,
    status     TEXT        NOT NULL,
    closed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
