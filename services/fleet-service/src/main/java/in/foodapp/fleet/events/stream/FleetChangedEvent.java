package in.foodapp.fleet.events.stream;

/** Published inside a transaction whenever the delivery pool or a partner changed; carries no data on purpose. */
public record FleetChangedEvent() {
}