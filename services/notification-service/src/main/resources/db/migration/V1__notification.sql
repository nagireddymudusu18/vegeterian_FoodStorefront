-- notification-service owns its data. It only ever learns about the rest of the system through feeds.

-- Consumer cursor per producer feed (CONVENTIONS "Event feed").
CREATE TABLE feed_cursor (
    source   TEXT   PRIMARY KEY,
    last_id  BIGINT NOT NULL
);

-- Verified contact details from identity-service (UserContactUpdated). Values are kept exactly as received:
-- AES-256-GCM ciphertext under CONTACT_EVENT_KEY, never plain text.
CREATE TABLE user_contact (
    user_id     UUID        PRIMARY KEY,
    phone_enc   TEXT,
    email_enc   TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Small replica of what the order feed says about an order, so a later payment or delivery event
-- (which only carries the order id) can be addressed to the right customer.
CREATE TABLE order_ref (
    order_id         UUID        PRIMARY KEY,
    customer_id      UUID        NOT NULL,
    restaurant_id    UUID        NOT NULL,
    order_number     TEXT,
    restaurant_name  TEXT,
    total_paise      BIGINT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who owns a restaurant (catalog feed), so a paid order can alert the owner.
CREATE TABLE restaurant_owner (
    restaurant_id  UUID PRIMARY KEY,
    owner_user_id  UUID,
    name           TEXT
);

-- One row per message shown in a user's inbox. A row is addressed either to one user (user_id) or, for
-- broadcasts such as a new delivery job, to everyone with a role (audience).
CREATE TABLE notification (
    id          UUID        PRIMARY KEY,
    user_id     UUID,
    audience    TEXT,
    kind        TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    order_id    UUID,
    -- makes event replays idempotent: the same event never creates the same message twice
    dedupe_key  TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ,
    CONSTRAINT notification_addressed CHECK ((user_id IS NULL) <> (audience IS NULL))
);
CREATE INDEX notification_user_idx ON notification (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX notification_audience_idx ON notification (audience, created_at DESC) WHERE audience IS NOT NULL;

-- Read marks for broadcasts (a user-addressed notification uses notification.read_at instead).
CREATE TABLE notification_read (
    notification_id  UUID        NOT NULL REFERENCES notification (id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL,
    read_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);

-- Outbound email / SMS queue. Events only add rows here; a scheduled dispatcher sends them, so a slow or
-- failing provider never blocks event processing and a failed send is retried.
CREATE TABLE delivery (
    id               BIGSERIAL   PRIMARY KEY,
    notification_id  UUID        NOT NULL REFERENCES notification (id) ON DELETE CASCADE,
    channel          TEXT        NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
    status           TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts         INT         NOT NULL DEFAULT 0,
    last_error       TEXT,
    next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at          TIMESTAMPTZ,
    UNIQUE (notification_id, channel)
);
CREATE INDEX delivery_due_idx ON delivery (next_attempt_at) WHERE status = 'PENDING';
