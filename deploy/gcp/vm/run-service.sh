#!/bin/bash
# Starts one Spring Boot service with only the environment it needs (secrets are not shared between services).
# Usage: run-service.sh identity|catalog|order|payment|fleet|notification   (run by systemd as veggo@<name>.service)
set -euo pipefail
svc="$1"
. /opt/veggo/app.env

db() { echo "DB_URL=jdbc:postgresql://127.0.0.1:5432/$1" "DB_USER=$1" "DB_PASSWORD=$2"; }

common=("PATH=/usr/bin:/bin" "HOME=/opt/veggo" "DB_POOL_MAX=3" "JWT_PUBLIC_KEY_PEM=$JWT_PUBLIC_KEY_PEM")
case "$svc" in
  identity)
    port=8081
    extra=($(db identity "$DB_PASSWORD_IDENTITY") "INTERNAL_FEED_KEY=$IDENTITY_FEED_KEY"
      "JWT_PRIVATE_KEY_PEM=$JWT_PRIVATE_KEY_PEM" "PII_ENC_KEY=$PII_ENC_KEY" "PII_HMAC_KEY=$PII_HMAC_KEY"
      "CONTACT_EVENT_KEY=$CONTACT_EVENT_KEY"
      "SMS_PROVIDER=$SMS_PROVIDER" "EMAIL_PROVIDER=$EMAIL_PROVIDER" "APP_BASE_URL=$APP_BASE_URL"
      "APP_MAIN_ADMIN_EMAIL=$APP_MAIN_ADMIN_EMAIL")
    ;;
  catalog)
    port=8082
    extra=($(db catalog "$DB_PASSWORD_CATALOG") "INTERNAL_FEED_KEY=$CATALOG_FEED_KEY" "SEED_DEMO_DATA=$SEED_DEMO_DATA")
    ;;
  order)
    port=8083
    extra=($(db order "$DB_PASSWORD_ORDER") "INTERNAL_FEED_KEY=$ORDER_FEED_KEY"
      "CATALOG_FEED_URL=http://127.0.0.1:8082" "CATALOG_FEED_KEY=$CATALOG_FEED_KEY"
      "PAYMENT_FEED_URL=http://127.0.0.1:8084" "PAYMENT_FEED_KEY=$PAYMENT_FEED_KEY"
      "FLEET_FEED_URL=http://127.0.0.1:8085" "FLEET_FEED_KEY=$FLEET_FEED_KEY" "FEED_POLL_MS=2000")
    ;;
  payment)
    port=8084
    extra=($(db payment "$DB_PASSWORD_PAYMENT") "INTERNAL_FEED_KEY=$PAYMENT_FEED_KEY"
      "ORDER_FEED_URL=http://127.0.0.1:8083" "ORDER_FEED_KEY=$ORDER_FEED_KEY" "FEED_POLL_MS=2000"
      "GATEWAY=$GATEWAY" "ALLOW_FAKE_GATEWAY=$ALLOW_FAKE_GATEWAY")
    ;;
  fleet)
    port=8085
    extra=($(db fleet "$DB_PASSWORD_FLEET") "INTERNAL_FEED_KEY=$FLEET_FEED_KEY"
      "ORDER_FEED_URL=http://127.0.0.1:8083" "ORDER_FEED_KEY=$ORDER_FEED_KEY" "FEED_POLL_MS=2000")
    ;;
  notification)
    port=8086
    extra=($(db notification "$DB_PASSWORD_NOTIFICATION") "CONTACT_EVENT_KEY=$CONTACT_EVENT_KEY"
      "SMS_PROVIDER=$SMS_PROVIDER" "EMAIL_PROVIDER=$EMAIL_PROVIDER"
      "IDENTITY_FEED_URL=http://127.0.0.1:8081" "IDENTITY_FEED_KEY=$IDENTITY_FEED_KEY"
      "CATALOG_FEED_URL=http://127.0.0.1:8082" "CATALOG_FEED_KEY=$CATALOG_FEED_KEY"
      "ORDER_FEED_URL=http://127.0.0.1:8083" "ORDER_FEED_KEY=$ORDER_FEED_KEY"
      "PAYMENT_FEED_URL=http://127.0.0.1:8084" "PAYMENT_FEED_KEY=$PAYMENT_FEED_KEY"
      "FLEET_FEED_URL=http://127.0.0.1:8085" "FLEET_FEED_KEY=$FLEET_FEED_KEY" "FEED_POLL_MS=2000")
    ;;
  *) echo "unknown service: $svc" >&2; exit 2 ;;
esac

exec env -i "${common[@]}" "${extra[@]}" "SERVER_PORT=$port" \
  /usr/bin/java -Xms64m -Xmx256m -XX:+UseSerialGC -jar "/opt/veggo/jars/${svc}.jar"
