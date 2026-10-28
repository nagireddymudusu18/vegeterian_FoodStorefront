CREATE TABLE feature_flags (
    flag_key    VARCHAR(60) PRIMARY KEY,
    enabled     BOOLEAN     NOT NULL,
    description TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID
);

INSERT INTO feature_flags (flag_key, enabled, description) VALUES
    ('otp_login', TRUE, 'Phone OTP sign-in and sign-up (enforced by identity-service)'),
    ('email_registration', TRUE, 'Creating new accounts with email and password (enforced by identity-service)'),
    ('guest_checkout', TRUE, 'Let visitors order with only a name and phone number (storefront)'),
    ('order_tracking', TRUE, 'Public order tracking by order number (storefront)'),
    ('live_order_updates', TRUE, 'Live order status stream; falls back to polling when off (storefront)'),
    ('delivery_module', FALSE, 'Delivery partner area (storefront; fleet service is not built yet)');
