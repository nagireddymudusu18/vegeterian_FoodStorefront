#!/bin/bash
# VM startup-script (instance metadata). There is no SSH: on every boot this fetches vm/install.sh from the
# private artifacts bucket with the VM service account token, then runs it. Output goes to the serial console.
set -u
BUCKET="${BUCKET:-veggo-eats-6110-sandbox-artifacts}"
mkdir -p /opt/veggo/stage

token() {
  curl -fsS -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'
}

fetch() {
  local enc
  enc=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1")
  curl -fsS -H "Authorization: Bearer $(token)" -o "$2" \
    "https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${enc}?alt=media"
}

echo "veggo-loader: fetching installer"
fetch vm/install.sh /opt/veggo/stage/install.sh || { echo "veggo-loader: cannot fetch install.sh"; exit 1; }
export BUCKET
declare -f token fetch > /opt/veggo/stage/fetch-lib.sh
exec bash /opt/veggo/stage/install.sh
