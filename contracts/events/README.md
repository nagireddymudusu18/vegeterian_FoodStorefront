# Event contracts

One file per event: `<EventType>.json` is a JSON Schema (draft 2020-12) for the event's `payload`. It is the single
source of truth; the payload section of `../CONVENTIONS.md` only summarises it. Each file also carries:

- `x-producer`: the one service allowed to publish it.
- `x-consumers`: the services that read it (an empty list means nobody consumes it yet).
- `examples[0]`: the golden payload. Producers and consumers both test against it.

Schemas are strict (`additionalProperties: false`), so adding or removing a field is always a deliberate edit here.

## How it is enforced (no shared library; each service has its own copy of the small test helper)

**Producers** (identity, catalog, order, payment, fleet). Each `OutboxService` accepts an optional `OutboxValidator`.
Production registers none. In tests, `contract/ContractOutboxValidator` is picked up automatically, so every event
written by any integration test is checked: it must have a contract, be produced by this service, and match its schema.
A renamed, dropped or retyped field fails the test that triggers it.

**Consumers** (order-service, fleet-service). `ConsumerContract*Test` feeds the golden example of each consumed event
through the real handler and asserts the effect (a replica row, an order status, a delivery job). Handlers skip
malformed events with a warning, so these tests check outcomes, not just the absence of exceptions.

## Changing an event

1. Edit the schema and the example in this folder. Fields consumers rely on stay `required`.
2. Update the producer, then run its tests: the guard shows every place the payload no longer matches.
3. Run the consumers' tests (`order-service`, `fleet-service`). A failure means that consumer cannot handle the new
   shape yet; fix it before the producer is deployed (add the new field as optional first, then require it later).
4. Never reuse an event type for a different meaning. Add a new type with a new file.

## Adding an event

Create `<EventType>.json` with `x-producer`, `x-consumers`, the schema and one example. Publishing an event type
without a file fails every producer test that triggers it.
