ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_domain TEXT NOT NULL DEFAULT 'CUSTOMER'
        CHECK (account_domain IN ('CUSTOMER', 'RESTAURANT_OWNER', 'DELIVERY_PARTNER', 'ADMIN')),
    ADD COLUMN IF NOT EXISTS loyalty_tier TEXT NOT NULL DEFAULT 'NEW'
        CHECK (loyalty_tier IN ('NEW', 'REGULAR', 'VIP')),
    ADD COLUMN IF NOT EXISTS dietary_cohort TEXT NOT NULL DEFAULT 'PURE_VEG'
        CHECK (dietary_cohort IN ('PURE_VEG', 'VEGAN', 'STRICT_JAIN')),
    ADD COLUMN IF NOT EXISTS group_assignment_mode TEXT NOT NULL DEFAULT 'AUTO_ORG_RULE'
        CHECK (group_assignment_mode IN ('AUTO_ORG_RULE', 'ADMIN_PINNED'));

CREATE INDEX IF NOT EXISTS idx_users_account_domain ON users (account_domain);

CREATE TABLE IF NOT EXISTS org_customer_group_rules (
    id                            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    new_customer_discount_percent INT NOT NULL DEFAULT 10,
    regular_min_orders            INT NOT NULL DEFAULT 1,
    vip_min_orders                INT NOT NULL DEFAULT 3,
    vip_min_spend_paise           BIGINT NOT NULL DEFAULT 150000,
    vip_free_delivery             BOOLEAN NOT NULL DEFAULT TRUE,
    vip_discount_percent          INT NOT NULL DEFAULT 5,
    enforce_cohort_diet_lock      BOOLEAN NOT NULL DEFAULT TRUE,
    strict_jain_tier1_only        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                    UUID
);
