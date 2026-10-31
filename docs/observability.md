# Observability

What you can see when something goes wrong, without attaching a debugger.

## Request ids
Every request has an id. The edge (Caddy) assigns one if the caller sent none, the
storefront sends its own, and each service:

- keeps a well-formed `X-Request-Id` (letters, digits, `.`, `_`, `-`, 8 to 64 long), otherwise makes a new one
  (so nothing a caller sends can inject text into the logs),
- puts it in every log line written while the request is served (`requestId`),
- returns it in the `X-Request-Id` response header.

The storefront shows it on server errors ("Reference: ...") so a user can quote it. To follow a request, search the
logs of the services for that id. Feed events applied by a consumer log as `feed-<source>-<eventId>`, for example
`feed-payment-1042`.

## Logs
Text by default, with the id in each line; the sandbox uses text so `smoke.mjs` can read OTPs and links, and the Ops Agent
ships `/opt/veggo/deploy/local/*-service.log` to Cloud Logging (log `veggo`). With `SPRING_PROFILES_ACTIVE=json` (use it
in production) every line is one JSON object with `service`, `level`, `message`, `logger_name` and `requestId`, ready
for a log service.

## Metrics
Each service serves Prometheus metrics at `/actuator/prometheus` (JVM, HTTP requests by URI and status, database
pool), tagged `application=<service>`. The endpoint is open inside the private network only: the edge blocks
`/actuator`, and the VM's services listen on localhost only (only Caddy is public). Scrape it from a collector on
the same network.

Feed consumers (order-service, fleet-service, notification-service) add:

| Metric | Meaning |
|---|---|
| `feed_events_total{source,outcome}` | events `applied`, `failed` (will retry) and `parked` |
| `feed_dead_letters_open` | events parked in `feed_dead_letter` and not yet resolved |

**Alert when `feed_dead_letters_open > 0`** (an admin must retry or discard: `GET /admin/dead-letters` on
order-service, `GET /fleet/admin/dead-letters` on fleet-service, `GET /notifications/admin/dead-letters` on
notification-service), and when `feed_events_total{outcome="failed"}` keeps
growing. Parking is also logged at ERROR. notification-service also counts sends in
`notification_delivery_total{channel,outcome}` (`sent`, `failed`, `skipped`): alert when `failed` keeps growing.

Suggested first alerts: a service's `up` is 0, HTTP 5xx rate above 1% for 5 minutes, `feed_dead_letters_open > 0`.

## Health
`/actuator/health` (and `/actuator/health/liveness`, `/readiness`) on every service, also blocked at the edge.

## Not done yet
- Tracing across services (the request id is the link for now) and a dashboard.
- A request id carried inside events, so a consumer's log line could point back to the request that caused it.
