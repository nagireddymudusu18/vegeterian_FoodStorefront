# Kubernetes base (Kustomize)

Cloud-neutral manifests. Postgres is NOT included: use any managed Postgres (RDS, Cloud SQL, Azure DB) with one
database per service; catalog needs the PostGIS extension.

Required secrets (create out-of-band, e.g. External Secrets / sealed-secrets):
- `foodapp-secrets`: JWT_PUBLIC_KEY_PEM, JWT_PRIVATE_KEY_PEM, PII_ENC_KEY, PII_HMAC_KEY, IDENTITY_FEED_KEY, CATALOG_FEED_KEY,
  ORDER_FEED_KEY, PAYMENT_FEED_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
- `<service>-db` (one per service): DB_URL, DB_USER, DB_PASSWORD

Apply: `kubectl apply -k deploy/k8s/base` after pushing images `foodapp/<service>:<tag>` to your registry
(override tags with a Kustomize overlay). Change the host in ingress.yaml.
