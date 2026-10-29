# Deployment runbook (Veggo Eats)

One VM running Docker Compose behind Caddy (automatic HTTPS). Images are built by GitHub Actions and pulled from GHCR.
Files: `deploy/prod/` (compose, Caddyfile, `.env.example`, `init-db.sh`) and `.github/workflows/deploy.yml`.

> Status: written but **not yet run** (no Docker on the dev machine). Expect to fix small things on the first staging deploy.

## 1. Domain and DNS
1. Check `veggoeats.in` is free and search the IP India trademark database for "Veggo" before buying.
2. Buy the domain (Namecheap, GoDaddy or BigRock) and put DNS on Cloudflare (free).
3. Create `A` records for `veggoeats.in` and `www` pointing to the VM's public IP. Set them to **DNS only** (grey cloud) at first so Caddy can get its certificate.
4. Email: Zoho Mail or Google Workspace for `support@`. For transactional mail add SPF, DKIM and DMARC records from the sender (Amazon SES or Resend).

## 2. The VM
- India region (AWS Mumbai, Azure Central India or DigitalOcean Bangalore), Ubuntu 24.04, 4 vCPU / 16 GB.
- Firewall: allow 22 (your IP only), 80 and 443. Nothing else; the databases and services are not published.
- Install Docker: `curl -fsSL https://get.docker.com | sh`, then `sudo usermod -aG docker deploy`.
- `sudo mkdir -p /opt/veggoeats && sudo chown deploy /opt/veggoeats`.

## 3. Secrets
1. On your laptop: `node deploy/scripts/gen-keys.mjs` produces keys and passwords (it writes `deploy/compose/.env`; copy values, never commit it).
2. On the VM: copy `deploy/prod/.env.example` to `/opt/veggoeats/.env` and fill every value. Use a **different** password per database and per feed key than local ones.
3. Set `DOMAIN`, `ACME_EMAIL` and `APP_MAIN_ADMIN_EMAIL` (your admin email). Register that email on the site and verify it, then sign in at `/admin/login`; the main admin adds other admins from `/admin/team`.

## 4. GitHub setup
- Make GHCR packages readable by the VM: on the VM run `docker login ghcr.io -u <user> -p <PAT with read:packages>` once.
- Create environments `staging` and `production` with secrets `SSH_HOST`, `SSH_USER`, `SSH_KEY` (a deploy-only key), `SSH_HOST_FINGERPRINT` and variable `DOMAIN`. Get the fingerprint from your own machine, never from the workflow: `ssh-keyscan -t ed25519 <vm-ip> | ssh-keygen -lf -` and use the `SHA256:...` value (check it matches the console or the VM's `/etc/ssh/ssh_host_ed25519_key.pub`). The deploy refuses to run without it. The `appleboy` deploy actions are pinned to commit hashes; update the hash on purpose when you upgrade them.
- Push to `develop` deploys staging, push to `main` deploys production. Use separate VMs and domains (for example `staging.veggoeats.in`).
- Keep LF line endings for the shell script: add `*.sh text eol=lf` to `.gitattributes`.

## 5. Database
- Quick start: bundled Postgres (`DB_HOST=db`, the workflow adds `--profile with-db`). It creates one role and database per service and enables PostGIS for catalog.
- Production: a managed Postgres with PostGIS and point-in-time backups. Create the same five roles and databases, enable `postgis` in `catalog`, then set `DB_HOST`.
- Google Cloud (Mumbai): a sandbox Cloud SQL instance already exists; see [deploy/gcp/README.md](../deploy/gcp/README.md). Create a separate production instance the same way, with backups on and no shared-core tier.
- With the bundled database, schedule backups, for example a nightly cron: `docker compose exec -T db pg_dumpall -U postgres | gzip > /backups/$(date +%F).sql.gz`, copied off the VM. **Test a restore** before launch.

## 6. First deploy
1. Push to `develop` and watch the `deploy` workflow.
2. On the VM: `docker compose -f docker-compose.prod.yml ps` and `docker compose -f docker-compose.prod.yml logs -f edge`.
3. Open `https://<domain>`. Sign up with your admin email and verify it (the link is in the identity log while `EMAIL_PROVIDER=logging`: `docker compose logs identity-service | grep VERIFY_EMAIL`).
4. Rollback: set `TAG` in `.env` to a previous commit SHA and run `docker compose -f docker-compose.prod.yml up -d`.

## 7. Before real customers
- [ ] Monitoring: uptime check on the site, a Prometheus collector scraping `/actuator/prometheus` on the private network, and alerts on `feed_dead_letters_open > 0` and 5xx rate (see [observability.md](observability.md)). Production logs are JSON.
- [ ] Real SMS provider (DLT registered) and email sender. `logging` writes OTPs into logs and is for staging only.
- [ ] Razorpay approved; set `GATEWAY=razorpay` and the key and webhook secrets; webhook URL `https://<domain>/webhooks/razorpay`. Keep `ALLOW_FAKE_GATEWAY=false`: the fake gateway marks every payment as paid and only starts when it is `true` (staging only).
- [ ] `SEED_DEMO_DATA=false`; remove demo restaurants.
- [ ] Fill the legal details in `storefront/src/lib/brand.ts` and have a lawyer review the privacy, terms and refund pages.
- [ ] Uptime monitoring (UptimeRobot) and error tracking (Sentry); log retention.
- [ ] Database backup restore tested; VM snapshots on.
- [ ] Cloudflare proxy (orange cloud) and rate limiting once HTTPS works. Test live order updates after enabling the proxy, since the streams are long-lived.

## Known limits
- Single VM: no high availability. Move to managed Kubernetes or ECS when traffic needs it (`deploy/k8s` does not include fleet-service yet).
- Live-update streams hold state per instance, so run one instance of each service until a broker is added.
- Login and OTP rate limits are also in memory per instance. With more than one instance an attacker gets that many times the allowance. Moving both to shared storage (Redis, or Postgres `LISTEN/NOTIFY` plus a counters table) is deliberately deferred until a second instance of any service is needed; do it before scaling out.
