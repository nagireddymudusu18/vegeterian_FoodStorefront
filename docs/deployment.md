# Deployment runbook (Veggo Eats)

Everything runs on Google Cloud: one VM (the six services as systemd units, the storefront, Caddy for automatic HTTPS)
and Cloud SQL for the databases. The sandbox is documented in [../deploy/gcp/README.md](../deploy/gcp/README.md); this
runbook covers what is needed beyond the sandbox. A production setup repeats the sandbox steps with bigger resources.

Files: `deploy/gcp/vm/` (`loader.sh`, `install.sh`, `run-service.sh`, `Caddyfile`), `deploy/scripts/gen-cloud-env.mjs`
(secrets) and `deploy/scripts/smoke.mjs` (post-deploy check).

## 1. Domain and DNS
1. Check `veggoeats.in` is free and search the IP India trademark database for "Veggo" before buying.
2. Buy the domain (Namecheap, GoDaddy or BigRock) and put DNS on Cloudflare (free).
3. Create `A` records for `veggoeats.in` and `www` pointing to the VM's static IP. Set them to **DNS only** (grey cloud) at first so Caddy can get its certificate.
4. Email: Zoho Mail or Google Workspace for `support@`. For transactional mail add SPF, DKIM and DMARC records from the sender (Amazon SES or Resend).
5. Re-run `gen-cloud-env.mjs --host veggoeats.in ... --keep-keys`, rebuild the storefront with `NEXT_PUBLIC_API_BASE=https://veggoeats.in` (it is baked in at build time) and reset the VM.

## 2. Sandbox versus production
- Sandbox: e2-medium VM, `db-f1-micro` Cloud SQL, fake payment gateway, logging SMS/email providers, demo data.
- Production: a separate project or at least separate resources, a larger database tier with high availability and
  point-in-time recovery (no shared-core tier), no demo data, real providers, and a different password per database
  and per feed key. Create it as a sandbox first, as the working rules require.
- The VM has no SSH by design: changes go through the bucket and a VM reset (see the GCP README).

## 3. Secrets
`node deploy/scripts/gen-cloud-env.mjs --host <host> --admin <main admin email> [--keep-keys]` writes the git-ignored
`deploy/local/cloud-app.env`; upload it as `app.env`. `--keep-keys` keeps existing keys so stored data stays readable
(changing `PII_ENC_KEY`, `PII_HMAC_KEY` or `CONTACT_EVENT_KEY` makes stored data unreadable). Register the admin email
on the site, verify it, then sign in at `/admin/login`; the main admin adds other admins from `/admin/team`.
Moving these secrets from the bucket to Secret Manager is a planned hardening step.

## 4. Database
- Cloud SQL for PostgreSQL 16, one role and database per service (`identity`, `catalog`, `order`, `payment`, `fleet`,
  `notification`), PostGIS enabled in `catalog`, no authorized networks (the VM reaches it through the Cloud SQL Auth Proxy).
- Backups on, with a **tested restore** before real customers.

## 5. Deploy and verify
1. Build and upload as described in [getting-started.md](getting-started.md), then reset the VM.
2. Watch the boot: Cloud Logging (log `veggo`) or `gcloud compute instances get-serial-port-output`.
3. With `RUN_SMOKE=1` in `app.env` the VM runs the smoke test once; it must end with `SMOKE TEST PASSED`.
4. Open `https://<host>`. Verification links and OTPs are in the logs while the providers are `logging`.
5. Rollback: re-upload the previous jars/storefront and reset the VM.

## 6. Before real customers
- [ ] Monitoring: uptime check on the site, a Prometheus collector scraping `/actuator/prometheus` on the private network (the Ops Agent can do this), and alerts on `feed_dead_letters_open > 0` and 5xx rate (see [observability.md](observability.md)). Production logs are JSON (`SPRING_PROFILES_ACTIVE=json`).
- [ ] Real SMS provider (DLT registered) and email sender. `logging` writes OTPs into logs and is for the sandbox only.
- [ ] Razorpay approved; set `GATEWAY=razorpay` and the key and webhook secrets; webhook URL `https://<domain>/webhooks/razorpay`. Keep `ALLOW_FAKE_GATEWAY=false`: the fake gateway marks every payment as paid and only starts when it is `true` (sandbox only).
- [ ] `SEED_DEMO_DATA=false`; remove demo restaurants.
- [ ] Fill the legal details in `storefront/src/lib/brand.ts` and have a lawyer review the privacy, terms and refund pages.
- [ ] Error tracking (Sentry); log retention.
- [ ] Database backup restore tested; VM snapshots on.
- [ ] Cloudflare proxy (orange cloud) and rate limiting once HTTPS works. Test live order updates after enabling the proxy, since the streams are long-lived.

## Known limits
- Single VM: no high availability. Move to a managed container platform when traffic needs it (the Dockerfiles in each service are kept for that).
- Live-update streams hold state per instance, so run one instance of each service until a broker is added.
- Login and OTP rate limits are also in memory per instance. With more than one instance an attacker gets that many times the allowance. Moving both to shared storage (Redis, or Postgres `LISTEN/NOTIFY` plus a counters table) is deliberately deferred until a second instance of any service is needed; do it before scaling out.
