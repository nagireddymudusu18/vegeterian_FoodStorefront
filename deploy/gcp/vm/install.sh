#!/bin/bash
# Installs and (re)starts the whole sandbox stack on this VM. Fetched and run by loader.sh on every boot.
# Safe to run repeatedly. Artifacts come from the private bucket (vm/, jars/, storefront.tar.gz, app.env).
set -uo pipefail
. /opt/veggo/stage/fetch-lib.sh
V=/opt/veggo
NODE_VERSION=22.11.0
CADDY_VERSION=2.8.4
PROXY_VERSION=2.14.1
INSTANCE=veggo-eats-6110:asia-south1:veggo-sandbox-db
log() { echo "veggo-install: $*"; }
need() { "$@" || { log "FAILED: $*"; exit 1; }; }

export DEBIAN_FRONTEND=noninteractive
if ! command -v java >/dev/null || ! command -v xz >/dev/null; then
  log "installing packages"
  need apt-get update -qq
  need apt-get install -y -qq openjdk-21-jre-headless xz-utils ca-certificates curl python3 logrotate
fi

id veggo >/dev/null 2>&1 || useradd --system --home-dir $V --shell /usr/sbin/nologin veggo
mkdir -p $V/jars $V/bin $V/deploy/scripts $V/deploy/local $V/storefront
chown -R veggo:veggo $V/deploy/local

if [ ! -x $V/node/bin/node ]; then
  log "installing node $NODE_VERSION"
  need curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  mkdir -p $V/node && need tar -xJf /tmp/node.tar.xz -C $V/node --strip-components=1
fi
if [ ! -x /usr/local/bin/caddy ]; then
  log "installing caddy $CADDY_VERSION"
  need curl -fsSL -o /tmp/caddy.tgz "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
  need tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy
fi
if [ ! -x /usr/local/bin/cloud-sql-proxy ]; then
  log "installing cloud-sql-proxy $PROXY_VERSION"
  need curl -fsSL -o /usr/local/bin/cloud-sql-proxy "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v$PROXY_VERSION/cloud-sql-proxy.linux.amd64"
  chmod +x /usr/local/bin/cloud-sql-proxy
fi
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy

log "downloading artifacts"
need fetch app.env $V/app.env
for f in identity catalog order payment fleet notification; do need fetch "jars/$f.jar" "$V/jars/$f.jar"; done
need fetch storefront.tar.gz /tmp/storefront.tar.gz
need fetch vm/run-service.sh $V/bin/run-service.sh
need fetch vm/Caddyfile $V/Caddyfile
need fetch scripts/smoke.mjs $V/deploy/scripts/smoke.mjs

systemctl stop veggo-storefront 2>/dev/null
rm -rf $V/storefront && mkdir -p $V/storefront
need tar -xzf /tmp/storefront.tar.gz -C $V/storefront
chmod 700 $V/bin/run-service.sh
chmod 600 $V/app.env
chown -R veggo:veggo $V/jars $V/storefront $V/bin $V/app.env $V/deploy

# Caddy only needs the host name and the ACME contact, not the service secrets.
. $V/app.env
printf 'DOMAIN=%s\nACME_EMAIL=%s\n' "$DOMAIN" "$ACME_EMAIL" > $V/caddy.env
chmod 640 $V/caddy.env; chgrp caddy $V/caddy.env
mkdir -p /etc/caddy && cp $V/Caddyfile /etc/caddy/Caddyfile

cat > /etc/systemd/system/veggo-proxy.service <<EOF
[Unit]
Description=Cloud SQL Auth Proxy
After=network-online.target
Wants=network-online.target
[Service]
User=veggo
ExecStart=/usr/local/bin/cloud-sql-proxy --address 127.0.0.1 --port 5432 $INSTANCE
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/veggo@.service <<'EOF'
[Unit]
Description=Veggo %i-service
After=veggo-proxy.service
Wants=veggo-proxy.service
[Service]
User=veggo
ExecStart=/opt/veggo/bin/run-service.sh %i
StandardOutput=append:/opt/veggo/deploy/local/%i-service.log
StandardError=append:/opt/veggo/deploy/local/%i-service.log
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/veggo-storefront.service <<'EOF'
[Unit]
Description=Veggo storefront
After=network-online.target
[Service]
User=veggo
WorkingDirectory=/opt/veggo/storefront
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1
ExecStart=/opt/veggo/node/bin/node server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/veggo-caddy.service <<'EOF'
[Unit]
Description=Caddy edge (HTTPS)
After=network-online.target
Wants=network-online.target
[Service]
User=caddy
Group=caddy
EnvironmentFile=/opt/veggo/caddy.env
Environment=HOME=/var/lib/caddy XDG_DATA_HOME=/var/lib/caddy/data XDG_CONFIG_HOME=/var/lib/caddy/config
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/logrotate.d/veggo <<'EOF'
/opt/veggo/deploy/local/*-service.log {
  daily
  rotate 3
  compress
  copytruncate
  missingok
  notifempty
}
EOF

if ! dpkg -s google-cloud-ops-agent 2>/dev/null | grep -q '^Status: install ok installed'; then
  log "installing Ops Agent (best effort)"
  dpkg --configure -a --force-confold >/dev/null 2>&1
  curl -fsSL -o /tmp/ops-repo.sh https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh &&
    bash /tmp/ops-repo.sh --also-install || log "Ops Agent not installed (continuing)"
fi
if dpkg -s google-cloud-ops-agent 2>/dev/null | grep -q '^Status: install ok installed'; then
  mkdir -p /etc/google-cloud-ops-agent
  cat > /etc/google-cloud-ops-agent/config.yaml <<'EOF'
logging:
  receivers:
    veggo:
      type: files
      include_paths: [/opt/veggo/deploy/local/*-service.log]
  service:
    pipelines:
      veggo:
        receivers: [veggo]
EOF
  systemctl restart google-cloud-ops-agent 2>/dev/null
fi

systemctl daemon-reload
systemctl enable veggo-proxy veggo-storefront veggo-caddy veggo@identity veggo@catalog veggo@order veggo@payment veggo@fleet veggo@notification >/dev/null 2>&1
systemctl restart veggo-proxy
sleep 3
for s in identity catalog order payment fleet notification; do systemctl restart veggo@$s; done
systemctl restart veggo-storefront veggo-caddy
log "units started; waiting for services"

for p in 8081 8082 8083 8084 8085 8086; do
  for i in $(seq 1 90); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/actuator/health)
    [ "$code" = "200" ] && break
    sleep 5
  done
  log "port $p health: $code"
done

if [ "${RUN_SMOKE:-0}" = "1" ] && [ ! -f /var/lib/veggo-smoke-done ]; then
  log "running smoke test"
  sudo -u veggo $V/node/bin/node $V/deploy/scripts/smoke.mjs > $V/deploy/local/smoke.log 2>&1
  rc=$?
  tail -n 40 $V/deploy/local/smoke.log
  log "smoke exit code $rc"
  [ $rc -eq 0 ] && touch /var/lib/veggo-smoke-done
fi
log "done"
