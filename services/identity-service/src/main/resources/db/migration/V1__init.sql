CREATE TABLE users (
    id          UUID PRIMARY KEY,
    phone_enc   BYTEA,
    phone_hash  TEXT UNIQUE,
    roles       TEXT[] NOT NULL DEFAULT ARRAY['CUSTOMER']::TEXT[],
    status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE otp_challenges (
    id          UUID PRIMARY KEY,
    phone_hash  TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    consumed    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_ip  TEXT
);
CREATE INDEX idx_otp_phone_created ON otp_challenges (phone_hash, created_at DESC);
CREATE INDEX idx_otp_ip_created ON otp_challenges (request_ip, created_at DESC);

CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users (id),
    token_hash   TEXT NOT NULL UNIQUE,
    family_id    UUID NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    replaced_by  UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);

CREATE TABLE consents (
    id        UUID PRIMARY KEY,
    user_id   UUID NOT NULL REFERENCES users (id),
    purpose   TEXT NOT NULL,
    version   TEXT NOT NULL,
    granted   BOOLEAN NOT NULL,
    at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip        TEXT
);
CREATE INDEX idx_consents_user ON consents (user_id);

CREATE TABLE outbox (
    id            BIGSERIAL PRIMARY KEY,
    type          TEXT NOT NULL,
    aggregate_id  UUID NOT NULL,
    payload       JSONB NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
