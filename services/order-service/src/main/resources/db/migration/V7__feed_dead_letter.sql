-- Consumers of other services' feeds: retry counting for events that fail, and a dead-letter table for events
-- that keep failing or are malformed, so one bad event never blocks the feed.
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
