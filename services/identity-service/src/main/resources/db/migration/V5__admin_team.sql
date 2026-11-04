-- Admin team: invitations from the main admin, and optional email codes at admin sign-in.
-- Only token families started by the admin sign-in may be refreshed into tokens carrying admin roles.
ALTER TABLE refresh_tokens ADD COLUMN admin_session BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE admin_invites (
    id          UUID PRIMARY KEY,
    email_hash  TEXT        NOT NULL,
    email_enc   BYTEA       NOT NULL,
    token_hash  TEXT        NOT NULL UNIQUE,
    invited_by  UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);
CREATE INDEX admin_invites_email_idx ON admin_invites (email_hash);

CREATE TABLE admin_login_codes (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL,
    code_hash   TEXT        NOT NULL,
    attempts    INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);
CREATE INDEX admin_login_codes_user_idx ON admin_login_codes (user_id);

INSERT INTO feature_flags (flag_key, enabled, description) VALUES
    ('admin_login_code', FALSE, 'Require an emailed 6-digit code after the password at admin sign-in (enforced by identity-service)');
