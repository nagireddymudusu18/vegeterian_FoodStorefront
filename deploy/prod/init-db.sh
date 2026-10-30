#!/bin/sh
# Runs once on first start of the bundled Postgres: one role and one database per service.
set -e
for pair in identity:PW_IDENTITY catalog:PW_CATALOG order:PW_ORDER payment:PW_PAYMENT fleet:PW_FLEET notification:PW_NOTIFICATION; do
  name="${pair%%:*}"
  pw=$(printenv "${pair##*:}")
  psql -v ON_ERROR_STOP=1 -U postgres <<SQL
CREATE ROLE "$name" LOGIN PASSWORD '$pw';
CREATE DATABASE "$name" OWNER "$name";
SQL
done
psql -v ON_ERROR_STOP=1 -U postgres -d catalog -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
