#!/bin/bash
# Installs PostgreSQL 16 + PostGIS on an Ubuntu 24.04 VM (Oracle Cloud Always Free) and prepares one
# role + database per service. Idempotent: safe to run again.
#   sudo ./setup-postgres.sh
# Optional env: LISTEN_EXTRA=172.17.0.1  (extra address for containers on this VM; default: localhost only)
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }

PW_FILE=/root/veggo-db-passwords.env
SERVICES="identity catalog order payment fleet"

apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib postgresql-16-postgis-3 ufw

# Passwords: generated once, kept root-only. Reuse on re-run.
touch "$PW_FILE"; chmod 600 "$PW_FILE"
for s in $SERVICES; do
  var="PW_$(echo "$s" | tr a-z A-Z)"
  grep -q "^$var=" "$PW_FILE" || echo "$var=$(openssl rand -hex 24)" >> "$PW_FILE"
done
set -a; . "$PW_FILE"; set +a

CONF=/etc/postgresql/16/main/postgresql.conf
HBA=/etc/postgresql/16/main/pg_hba.conf
LISTEN="localhost"
[ -n "${LISTEN_EXTRA:-}" ] && LISTEN="localhost,${LISTEN_EXTRA}"
sed -i "s|^#\?listen_addresses.*|listen_addresses = '${LISTEN}'|" "$CONF"
sed -i "s|^#\?password_encryption.*|password_encryption = scram-sha-256|" "$CONF"
if [ -n "${LISTEN_EXTRA:-}" ] && ! grep -q "veggo-containers" "$HBA"; then
  echo "host all all 172.16.0.0/12 scram-sha-256 # veggo-containers" >> "$HBA"
fi
systemctl restart postgresql

for s in $SERVICES; do
  var="PW_$(echo "$s" | tr a-z A-Z)"; pw="${!var}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$s') THEN
    CREATE ROLE "$s" LOGIN PASSWORD '$pw';
  ELSE
    ALTER ROLE "$s" PASSWORD '$pw';
  END IF;
END \$\$;
SQL
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$s'" | grep -q 1; then
    sudo -u postgres createdb -O "$s" "$s"
  fi
done
sudo -u postgres psql -d catalog -v ON_ERROR_STOP=1 -q -c 'CREATE EXTENSION IF NOT EXISTS postgis'

# Nightly logical backups, 7 days kept locally. Copy them off the VM too (see README).
install -d -m 700 -o postgres -g postgres /var/backups/veggo
cat > /usr/local/bin/veggo-backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail
d=/var/backups/veggo; stamp=$(date +%F)
for s in identity catalog order payment fleet; do
  pg_dump -Fc "$s" > "$d/$s-$stamp.dump"
done
find "$d" -name '*.dump' -mtime +7 -delete
EOF
chmod 755 /usr/local/bin/veggo-backup.sh
echo "30 2 * * * /usr/local/bin/veggo-backup.sh" | crontab -u postgres -

# Only SSH, HTTP and HTTPS are reachable from outside; Postgres stays private.
ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable

echo "Done. Postgres listens on: ${LISTEN}. Service passwords are in $PW_FILE (root only)."
