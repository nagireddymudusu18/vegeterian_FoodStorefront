# Free database on Oracle Cloud (Always Free)

Self-hosted PostgreSQL 16 + PostGIS on one free Ubuntu VM, one role and database per service
(`identity`, `catalog`, `order`, `payment`, `fleet`). You operate it, so read the Backups section.

## 1. Create the VM (you, in the Oracle console)

1. Sign up at oracle.com/cloud/free and pick the **India West (Mumbai)** home region. It cannot be changed later.
2. Compute → Create instance: image **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** (Arm, 2 OCPU / 12 GB is plenty;
   Always Free allows up to 4 OCPU / 24 GB). If Mumbai shows "out of capacity", retry later or try another availability domain.
3. Download the generated SSH private key. Keep it out of the repo.
4. In the VCN security list, allow ingress only on TCP 22, 80 and 443. **Never open 5432.**

## 2. Prepare Postgres

```
scp -i key.pem deploy/oracle/setup-postgres.sh ubuntu@<vm-ip>:~
ssh -i key.pem ubuntu@<vm-ip> "sudo bash setup-postgres.sh"
```

Service passwords are generated on the VM in `/root/veggo-db-passwords.env` (root only, never in git).

## 3. Migrate the local data

With the local Postgres running and the local stack stopped:

```
powershell -File deploy\scripts\db-migrate.ps1 -Server ubuntu@<vm-ip> -KeyFile C:\path\key.pem
```

It refuses to touch non-empty remote databases, and prints `MIGRATION VERIFIED` only if every table's row count matches.

## 4. Connecting the services

Postgres listens on localhost only. To run the services on this same VM, re-run step 2 with
`LISTEN_EXTRA=172.17.0.1` (the Docker bridge) and point each service's `DB_URL` at that address.
To reach the database from your laptop, use an SSH tunnel: `ssh -i key.pem -L 5433:127.0.0.1:5432 ubuntu@<vm-ip>`.

## Backups

`/var/backups/veggo` holds nightly dumps (7 days) on the same disk, which does not survive losing the VM.
Before real customers, copy them off the VM (for example OCI Object Storage, which has a free allowance)
and test a restore.
