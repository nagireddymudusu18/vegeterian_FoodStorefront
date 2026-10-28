-- Email verification and password reset.
-- Accounts that already have an email were created before verification existed, so they count as verified.
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET email_verified = TRUE WHERE email_hash IS NOT NULL;

-- One-time links. Only the SHA-256 of the token is stored.
CREATE TABLE email_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id),
    purpose     VARCHAR(10) NOT NULL,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_email_tokens_user ON email_tokens (user_id, purpose);
