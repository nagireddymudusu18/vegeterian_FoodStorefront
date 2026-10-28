-- Registration with name, email and password (in addition to phone OTP).
-- name/email are PII: encrypted at rest, with a blind index for email lookups (same scheme as phone).
ALTER TABLE users ADD COLUMN name_enc       BYTEA;
ALTER TABLE users ADD COLUMN email_enc      BYTEA;
ALTER TABLE users ADD COLUMN email_hash     TEXT UNIQUE;
ALTER TABLE users ADD COLUMN password_hash  TEXT;
ALTER TABLE users ADD COLUMN failed_logins  INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until   TIMESTAMPTZ;
