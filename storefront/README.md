# Storefront

Next.js 15 (App Router, TypeScript strict, Tailwind CSS 4) web storefront for the India food-delivery marketplace.
It talks **only** to the edge proxy (`NEXT_PUBLIC_API_BASE`, the sandbox URL in a deployed build) using the paths
`/api/identity/*`, `/api/catalog/*`, `/api/orders/*`, `/api/payments/*`, `/api/fleet/*` and `/api/notifications/*`
(the edge strips the prefix). See `../contracts/CONVENTIONS.md`.

## Run

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE to the sandbox URL to develop against it
npm install
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run lint`, `npm run build`, `npm start`, `npm test` (Vitest: money formatting, cart logic, order/diet helpers).

For pages to load data the sandbox must be running (see `../deploy/gcp/README.md`). The sandbox serves the storefront and
the APIs from one origin, so a `npm run dev` server on `localhost:3000` calling it cross-origin will normally be blocked
by the browser (CORS); to see real data, build and deploy. Without a backend the UI shows error states with a retry button.

The deployed storefront is the `output: "standalone"` build (`node server.js`); see `../docs/getting-started.md` for how
it is packaged and uploaded.

## Docker

```bash
docker build -t storefront --build-arg NEXT_PUBLIC_API_BASE=http://localhost:8080 .
docker run -p 3000:3000 storefront
```

`NEXT_PUBLIC_API_BASE` is inlined at **build** time, so pass it as a build arg. The image is multi-stage
(`node:22-alpine`), uses Next's `output: "standalone"` and runs as a non-root user.

## Project structure

```
src/
  app/                  routes (Next.js App Router)
  features/
    auth/               auth context, route guard, phone normalisation
    catalog/            diet rules, diet preference, DietSwitch, badges
    cart/               cart logic and context
    orders/             order status / lifecycle helpers
  shell/                Header and Providers (compose the features, used by app/layout)
  components/           generic UI primitives (ui.tsx)
  lib/                  cross-cutting: api client, tokens, money formatting
```

Rules: import a feature only through its `index.ts` barrel (`@/features/cart`), not its internal files. `lib/` and
`components/` never import from `features/`. Tests sit next to the code they test.

## Behaviour notes

- **Diet switch** (All / Pure Veg / Vegan / Jain) and **location** (browser geolocation or manual lat/lng, default
  Bengaluru 12.9716, 77.5946) persist in `localStorage`. The restaurant list is re-queried with `diet=`; menus are filtered
  client-side instantly.
- **Cart** is client-side (`localStorage`), single restaurant (confirm dialog when switching). The subtotal shown is an
  **estimate**; orders are created with item ids and quantities only. The server computes and confirms all prices.
- **Checkout** creates the order, then the payment using the server-confirmed `totalPaise`. Each attempt has an
  `Idempotency-Key` kept in `sessionStorage` (order key reused on network retry; a new payment key per payment retry).
- **Order tracking** streams status changes from `GET /orders/{id}/stream` (server-sent events, read with `fetch` so the
  Bearer token can be sent) and refetches `GET /orders/{id}` on each change. A slow 15 s poll stays on as a fallback;
  if the stream is down it polls every 3 s and reconnects with backoff, until a terminal status.
- **Auth**: OTP login with consent; access/refresh tokens are held in memory and mirrored to `localStorage`. A 401 triggers
  one refresh attempt, then a redirect to `/login`. Account deletion is available on `/profile` with a confirmation dialog.

## Security note / later hardening

Tokens in `localStorage` are readable by any script running on the page (XSS risk). Moving to a Backend-for-Frontend that
stores tokens in **httpOnly, Secure, SameSite cookies** is a planned hardening step. Until then keep a strict CSP at the edge
and avoid injecting untrusted HTML (the app renders all API data as text).

Pages added: /verify-email, /forgot-password, /reset-password; the profile page can add a phone; the home page has cuisine chips.

## Areas

- src/app/(customer) - all customer pages (URLs unchanged)
- src/app/admin - admin dashboard and feature flags (ADMIN only)
- src/app/partner - delivery partner area (behind the delivery_module flag)
- src/features/flags - flags context (useFlag)

