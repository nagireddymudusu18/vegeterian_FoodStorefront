package in.foodapp.payment.events;

/**
 * Optional check run on every event just before it is written to the outbox. Production has no implementation;
 * tests register one that validates the payload against the event contract in contracts/events.
 */
public interface OutboxValidator {

    void validate(String type, String payloadJson);
}
