# Google Cloud (sandbox first)

Everything on GCP is created as a **sandbox** first, kept small and cheap, and only then copied to a production
setup. Billing is on a Google account with free credits, and a monthly budget alert exists on the billing account.

## What exists

| Item | Value |
|---|---|
| Project | `veggo-eats-6110` |
| Region | `asia-south1` (Mumbai) |
| Sandbox DB | Cloud SQL `veggo-sandbox-db`: PostgreSQL 16, `db-f1-micro`, single zone, 10 GB HDD, 3 nightly backups |
| Databases and users | `identity`, `catalog`, `order`, `payment`, `fleet`, each owned by a user of the same name (add `notification` before the next deploy: create the user and database, put its password in `gcp.env` as `PW_NOTIFICATION`). `postgis` is enabled in `catalog` |
| Credentials | `deploy/local/gcp.env`, which is git-ignored. Never commit it or paste it into chat |

The instance has a public IP but **no authorized networks**, so nothing can connect to it directly.
Cost is roughly ₹800 to ₹1,000 a month while it runs; stop it with
`gcloud sql instances patch veggo-sandbox-db --activation-policy=NEVER` and start it again with `ALWAYS`.

## Connecting

- From services running on GCP: the Cloud SQL connector or Cloud SQL Auth Proxy.
- From a laptop on an open network: Cloud SQL Auth Proxy with `--gcloud-auth`.
- On the managed work laptop the proxy's secure handshake is reset (the network inspects TLS), so direct database
  access is not possible from there. Move data with `gcloud sql import/export` through a private bucket (HTTPS only),
  or inspect it through the services' own admin APIs.

## Data

The databases hold only data created in the sandbox (the local copy was a one-off migration and no longer exists).
Back up with Cloud SQL backups (3 nightly) before risky changes; there is nothing to migrate from a laptop.

## Sandbox VM (the whole stack runs here)

| Item | Value |
|---|---|
| VM | `veggo-sandbox-vm`: e2-medium, Ubuntu 24.04, `asia-south1-a`, 20 GB, static IP `veggo-sandbox-ip` = 34.47.166.37 |
| URL | `https://34-47-166-37.sslip.io` (sslip.io gives a free hostname; Caddy gets the certificate automatically) |
| Runs | six services on localhost (8081 to 8086; notification-service on 8086 is added in the repo and goes live with the next deploy), the storefront on 3000, Caddy on 80/443, Cloud SQL Auth Proxy on 127.0.0.1:5432 |
| Service account | `veggo-sandbox-vm@veggo-eats-6110.iam.gserviceaccount.com` (Cloud SQL client, log and metric writer, read on the bucket) |
| Artifacts | private bucket `gs://veggo-eats-6110-sandbox-artifacts`: `jars/`, `storefront.tar.gz`, `app.env` (secrets), `vm/`, `scripts/` |
| Firewall | only `veggo-allow-web` (tcp 80 and 443). There is **no SSH**; the default SSH and RDP rules were deleted |

The sandbox uses the **fake payment gateway** and **logging** SMS/email providers. Do not take real orders on it.
Sign-in codes and verification links are written to the service logs, so read them in Cloud Logging
(log `veggo`) or with `gcloud logging read 'logName:"logs/veggo"' --freshness=15m`. The text is in `jsonPayload.message`
(not `textPayload`), so filter on that or read the entries as JSON. On Windows set `[Console]::OutputEncoding` to UTF-8 and
`$env:PYTHONUTF8=1` before running gcloud, otherwise the rupee sign (₹) is shown as `?` in your terminal (the logs are fine).

### How deploys work (no SSH)

The VM metadata `startup-script` is `deploy/gcp/vm/loader.sh`. On every boot it downloads `vm/install.sh` from the
bucket, which installs the runtimes, downloads the jars, storefront and `app.env`, writes the systemd units and
restarts everything. If `RUN_SMOKE=1` is in `app.env` it also runs `deploy/scripts/smoke.mjs` once.

To deploy a change: rebuild, upload the new jar or storefront to the bucket, then
`gcloud compute instances reset veggo-sandbox-vm --zone=asia-south1-a`.

Secrets: `node deploy/scripts/gen-cloud-env.mjs --host 34-47-166-37.sslip.io --admin <main admin email> [--acme-email <real email>] [--smoke] [--keep-keys]`
writes `deploy/local/cloud-app.env` (git-ignored); upload it as `app.env`. `--keep-keys` keeps the existing keys so
stored data stays readable. The storefront must be built with `NEXT_PUBLIC_API_BASE=https://34-47-166-37.sslip.io`.

### Cost and stopping

Cloud SQL plus the VM is roughly ₹2,000 to ₹2,500 a month while both run. To pause:

```
gcloud compute instances stop veggo-sandbox-vm --zone=asia-south1-a
gcloud sql instances patch veggo-sandbox-db --activation-policy=NEVER
```

A stopped VM keeps costing a little for the disk and the reserved IP. To remove everything, delete the VM, the
address `veggo-sandbox-ip`, the bucket and the Cloud SQL instance.

## Not done yet

- No production instance. Create one later with a larger tier, high availability and point-in-time recovery.
- Private IP, IAM database logins and Secret Manager for the service passwords (secrets sit in a private bucket now).
- A real domain, payment gateway and SMS/email providers.
- Per-service rate limits and live streams are per instance, so run one VM until shared state is added.
