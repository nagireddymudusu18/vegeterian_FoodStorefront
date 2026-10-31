package in.foodapp.payment.events.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

/** Raised (before any DB work) when a feed event payload is missing/invalid; the poller parks the event. */
public class MalformedEventException extends RuntimeException {

    public MalformedEventException(String message) {
        super(message);
    }

    static UUID uuid(JsonNode payload, String field) {
        String text = text(payload, field);
        try {
            return UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            throw new MalformedEventException("Field '" + field + "' is not a UUID");
        }
    }

    static String text(JsonNode payload, String field) {
        JsonNode n = payload == null ? null : payload.get(field);
        if (n == null || n.isNull()) {
            throw new MalformedEventException("Missing field '" + field + "'");
        }
        return n.asText();
    }
}
