# Domain-Isolated Module Accounts & Org-Managed Customer Groups

This plan introduces strict per-module account isolation across the Customer, Restaurant Owner, Delivery Partner, and Admin domains—allowing any person to sign up independently on the Restaurant or Delivery Partner modules without ever combining or merging experiences—alongside an org-managed Customer Group & Rules engine for Loyalty Tiers (`NEW`, `REGULAR`, `VIP`) and Dietary Cohorts (`PURE_VEG`, `VEGAN`, `STRICT_JAIN`).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions incorporate your latest revision and confirmed preferences:

- **Confirmed Decision 1 — Independent Per-Domain Accounts & Zero Experience Mixing**:
  - Every module (`CUSTOMER`, `RESTAURANT_OWNER`, `DELIVERY_PARTNER`, `ADMIN`) acts as its own isolated identity domain with an explicit `accountDomain` flag.
  - **Independent Sign-Up Allowed**: Even if a user already has a `CUSTOMER` account with a given phone number or email, they can freely sign up on the **Restaurant Partner** (`/restaurant/login`) or **Delivery Partner** (`/partner/login`) module. The system creates a separate, domain-scoped account record (`(accountDomain, phone)` / `(accountDomain, email)`) rather than merging roles onto their customer profile.
  - **Complete Experience Separation**: Customer, Restaurant Owner, and Delivery Partner experiences are never combined. Cross-portal role switchers and "Become a Delivery Partner" enrollment widgets are removed from the Customer Profile so each module remains 100% dedicated to its persona.
- **Confirmed Decision 2 — Dual Customer Group Taxonomy**: Customer accounts (`accountDomain = "CUSTOMER"`) are segmented across two orthogonal group dimensions:
  - **Loyalty Tiers**: `NEW` (first-time/onboarding customers), `REGULAR` (established customers), and `VIP` (free delivery & priority perks).
  - **Dietary Cohorts**: `PURE_VEG`, `VEGAN`, and `STRICT_JAIN` (governing menu guardrails and kitchen tier eligibility).
- **Confirmed Decision 3 — Admin & Org-Rule Controlled Groups**: Customers cannot self-switch their customer group. Group assignments and automatic promotion/benefit rules (such as order-count thresholds for `VIP`, delivery fee waivers, and cohort dietary locks) are configured and enforced centrally by Org Admins.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Per-Module Identity & Experience Isolation**:
     - Resolves the active module domain (`CUSTOMER`, `RESTAURANT_OWNER`, `DELIVERY_PARTNER`, `ADMIN`) from the hostname or portal route scope (`/`, `/restaurant`, `/partner`, `/admin`).
     - Scopes user lookup, registration, OTP verification, and session tokens by `accountDomain`. Signing up on `/restaurant/login` or `/partner/login` provisions a dedicated `RESTAURANT_OWNER` or `DELIVERY_PARTNER` account with its own ID, credentials, and token scope, keeping Customer, Kitchen, and Fleet accounts completely separate.
  2. **Customer Group Engine (Loyalty Tiers + Dietary Cohorts)**:
     - Evaluates each customer's assigned group and org-level rules to automatically apply checkout benefits (₹0 delivery for `VIP`, welcome perks for `NEW`, and strict Tier-1 kitchen / ingredient guardrails for `STRICT_JAIN` and `VEGAN` cohorts).
  3. **Org Admin Group & Rules Management**:
     - Gives administrators a dedicated control plane to filter accounts by `accountDomain`, assign customer groups per customer, and configure organization-wide qualification and benefit rules.
- **Target Audience / Persona**:
  - **Customers**: Enjoy a pure food-ordering experience with automatic loyalty tier fee waivers and dietary cohort protection, free of partner/rider console clutter.
  - **Restaurant Owners & Delivery Partners**: Have dedicated sign-up and sign-in flows on their respective portals with independent accounts and isolated sessions.
  - **Org Administrators**: Manage domain-scoped accounts, customer group assignments, and automated org rules from the Admin Console.
- **Key Value**: Mirrors multi-database domain isolation at the identity and UX layers while turning customer segmentation into automatic checkout and dietary benefits.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Independent Module Sign-Up & Sign-In (`CUSTOMER`, `RESTAURANT_OWNER`, `DELIVERY_PARTNER`)**:
     - **Customer Module (`/login`)**: Creates and authenticates `accountDomain: "CUSTOMER"` accounts only. Customer Profile (`/profile`) displays only customer-relevant settings (saved addresses, dietary & allergen preferences, read-only Customer Group membership) with zero partner enrollment banners or cross-portal links.
     - **Restaurant Partner Module (`/restaurant/login`)**: Supports both **Sign In** and **Partner Sign Up** (Phone OTP or Email & Password) scoped strictly to `accountDomain: "RESTAURANT_OWNER"`. If an existing customer signs up here with the same phone/email, a brand-new `RESTAURANT_OWNER` account is created for the kitchen module without touching their customer account.
     - **Delivery Partner Module (`/partner/login`)**: Supports both **Sign In** and **Rider Sign Up** (Phone OTP or Email & Password) scoped strictly to `accountDomain: "DELIVERY_PARTNER"`, creating an independent rider account and session.
  2. **Customer Storefront & Checkout Group Experience**:
     - Signed-in customers see a read-only **Customer Group & Perks** card on their Profile and in the Cart checkout drawer showing their Org-assigned Loyalty Tier (`NEW`, `REGULAR`, `VIP`) and Dietary Cohort (`PURE_VEG`, `VEGAN`, `STRICT_JAIN`).
     - At checkout, the order pricing engine automatically applies the active Org Rule for their Loyalty Tier (e.g., `VIP` waives the ₹30 delivery fee; `NEW` applies the welcome discount) and validates cart items against their Dietary Cohort.
  3. **Admin Console — Domain Directory, Customer Groups & Org Rules**:
     - **Domain-Scoped User Directory**: Each account row clearly displays its immutable `accountDomain` flag (`CUSTOMER`, `RESTAURANT_OWNER`, `DELIVERY_PARTNER`, `ADMIN`).
     - **Customer Group Assignment**: For `CUSTOMER` domain accounts, Admins can filter by Loyalty Tier or Dietary Cohort and update a customer's assigned tier/cohort inline or set it to follow automatic Org Rules.
     - **Org Group Rules Configuration**: Admins can edit live organization rules (minimum completed orders or spend for `REGULAR` and `VIP` auto-promotion, delivery fee waiver toggles, discount percentages, and strict Tier-1 kitchen enforcement for `STRICT_JAIN`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Warm **Haldi & Leaf** editorial storefront palette for customers; focused operational workspaces for Kitchen and Fleet portals; high-density single-elevation tabular layout for the Org Admin Console.
  - *Color Palette & Mood*:
    - Storefront: Warm Cream (`#FAF6EE`), Leaf Green (`#1B5E3A`), Haldi Gold (`#F4B400`), Deep Ink (`#1C1917`).
    - Admin Console: Crisp white surfaces with `1px` stone borders and semantic badges (`#16A34A` for VIP/Active rules, `#D97706` for Cohort Guardrails).
  - *Typography & Hierarchy*: Display headings in `Plus Jakarta Sans` / `Outfit`, readable body copy, and `tabular-nums` monospace (`font-mono`) for order counts, rupee thresholds, and discounts.
- **Interactive Feedback & Motion**:
  - Instant toast feedback when signing up on a partner module, updating a customer's group, or saving Org Rules.
  - Live recalculation of delivery fees and loyalty discounts inside the Cart drawer showing the applied Org Rule.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Per-Domain Compound Identity Keys (`accountDomain + phone/email`)**
  - *Chosen Approach*: Scope user uniqueness and authentication lookups by `(accountDomain, phone)` and `(accountDomain, email)` across both the Java `identity-service` database migration (`V5__user_domain_and_customer_groups.sql`) and the storefront backend.
  - *Why*: Allows the same human user to register as a Customer on `/` and separately register as a Restaurant Owner on `/restaurant` or Delivery Partner on `/partner` with zero data collision or experience bleed—matching a multi-DB per-domain architecture.
  - *Alternatives Considered*: Global phone/email uniqueness with multi-role arrays, which forces shared accounts and mixes customer and partner experiences.
- **Decision 2: Hybrid Customer Group Evaluation (Explicit Admin Pin + Automatic Org Rules)**
  - *Chosen Approach*: Each `CUSTOMER` account supports either automatic evaluation from the Org Rules thresholds (based on completed order count and lifetime spend) or an Admin-pinned override, while Dietary Cohort defaults to `PURE_VEG` and is managed by Admin/Org rules.
  - *Why*: Gives Org Admins both automated tier progression as customers complete orders and manual control for VIP guests or strict dietary cohorts.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     PORTAL DOMAIN RESOLVER & GUARD                           │
│  Hostname / Route Scope ──► CUSTOMER │ RESTAURANT_OWNER │ DELIVERY_PARTNER   │
└───────────┬──────────────────────────┬──────────────────────────┬────────────┘
            │ Isolated Customer Auth   │ Isolated Kitchen Auth    │ Isolated Rider Auth
            ▼                          ▼                          ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────┐
│   CUSTOMER ACCOUNTS   │  │  RESTAURANT ACCOUNTS  │  │   DELIVERY ACCOUNTS    │
│ domain: CUSTOMER      │  │ domain:               │  │ domain:                │
│ • loyaltyTier         │  │   RESTAURANT_OWNER    │  │   DELIVERY_PARTNER     │
│ • dietaryCohort       │  │ • Dedicated Sign-Up   │  │ • Dedicated Sign-Up    │
│ • groupAssignmentMode │  │ • Kitchen Console     │  │ • Rider Fleet Console  │
└───────────┬───────────┘  └───────────────────────┘  └────────────────────────┘
            │
            ▼  Evaluated against Org Rules
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ORG CUSTOMER GROUP RULES ENGINE                         │
│  • Loyalty Rules: NEW discount %, REGULAR min orders, VIP min orders/spend,  │
│    VIP ₹0 delivery waiver, VIP discount %                                    │
│  • Cohort Rules: Enforce Dietary Cohort lock, Strict Jain Tier-1 kitchen     │
└───────────────────┬──────────────────────────────────────────┬───────────────┘
                    ▼                                          ▼
┌─────────────────────────────────────────┐  ┌─────────────────────────────────┐
│     CUSTOMER STOREFRONT & CHECKOUT      │  │        ORG ADMIN CONSOLE        │
│  • Read-only Group & Perks Badge        │  │  • Per-Domain Account Directory │
│  • Live Cart Fee Waiver & Tier Discount │  │  • Customer Group Assignment UI │
│  • Cohort Guardrail Enforcement         │  │  • Org Rules Configuration Form │
└─────────────────────────────────────────┘  └─────────────────────────────────┘
```

- **Data Model & State**:
  - **Domain-Scoped User Identity (`Me`, `AdminUser`, & `identity-service` `users` table)**:
    - `accountDomain`: `"CUSTOMER" | "RESTAURANT_OWNER" | "DELIVERY_PARTNER" | "ADMIN"` — immutable flag set from the portal domain at registration. Unique constraints on `(account_domain, phone_hash)` and `(account_domain, email_hash)` allow independent accounts across domains.
    - `customerGroup` (populated for `accountDomain === "CUSTOMER"`):
      - `loyaltyTier`: `"NEW" | "REGULAR" | "VIP"`
      - `dietaryCohort`: `"PURE_VEG" | "VEGAN" | "STRICT_JAIN"`
      - `assignmentMode`: `"AUTO_ORG_RULE" | "ADMIN_PINNED"`
      - `completedOrdersCount`: number
      - `lifetimeSpendPaise`: number
  - **Organization Customer Group Rules (`OrgCustomerGroupRules`)**:
    - `newCustomerDiscountPercent`: number (e.g., `10%` off while in `NEW` tier)
    - `regularMinOrders`: number (e.g., `1` completed order)
    - `vipMinOrders`: number (e.g., `5` completed orders)
    - `vipMinSpendPaise`: number (e.g., `250000` paise / `₹2,500`)
    - `vipFreeDelivery`: boolean (waives delivery fee for `VIP` customers)
    - `vipDiscountPercent`: number (e.g., `5%` ongoing loyalty discount)
    - `enforceCohortDietLock`: boolean (locks storefront dietary filter & cart validation to the customer's assigned `dietaryCohort`)
    - `strictJainTier1Only`: boolean (restricts `STRICT_JAIN` cohort orders to Tier-1 exclusive vegetarian kitchens)

- **Interactive Component & State Mapping**:
  - **Module Login & Registration (`/login`, `/restaurant/login`, `/partner/login`, `/admin/login`)**:
    - Passes `accountDomain` on OTP send/verify, email login, and registration.
    - `/restaurant/login` and `/partner/login` include a **Register Partner Account** tab so new restaurant owners and delivery partners can sign up directly on their module without touching any customer account.
    - Token claims include `accountDomain`; each portal shell verifies that the active session token's `accountDomain` matches the module's domain.
  - **Customer Storefront, Profile & Cart Checkout**:
    - Removes the Delivery Partner enrollment widget and cross-portal role links from `/profile` so the Customer module never mixes partner experiences.
    - Displays the customer's active `loyaltyTier` (`NEW`, `REGULAR`, `VIP`) and `dietaryCohort` (`PURE_VEG`, `VEGAN`, `STRICT_JAIN`) with their active perks.
    - Cart & Order creation calculate `discountPaise` and `deliveryFeePaise` using the customer's effective group and `OrgCustomerGroupRules`, and enforce cohort diet guardrails.
  - **Admin Console (`/admin/team`)**:
    - Filters accounts by `accountDomain` (`CUSTOMER`, `RESTAURANT_OWNER`, `DELIVERY_PARTNER`, `ADMIN`) and by Customer Group (`NEW`, `REGULAR`, `VIP`, `PURE_VEG`, `VEGAN`, `STRICT_JAIN`).
    - Allows Admins to assign a customer's `loyaltyTier`, `dietaryCohort`, and `assignmentMode` (`AUTO_ORG_RULE` vs `ADMIN_PINNED`), and edit the live **Org Customer Group Rules** configuration.
