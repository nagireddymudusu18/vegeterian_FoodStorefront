package in.foodapp.order.events.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

/** Raised (before any DB work) when a feed event payload is missing/invalid; the event is skipped. */
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

    static String optText(JsonNode payload, String field) {
        JsonNode n = payload == null ? null : payload.get(field);
        return n == null || n.isNull() ? null : n.asText();
    }

    static long number(JsonNode payload, String field) {
        JsonNode n = payload == null ? null : payload.get(field);
        if (n == null || !n.isNumber()) {
            throw new MalformedEventException("Field '" + field + "' is not a number");
        }
        return n.asLong();
    }

    static double decimal(JsonNode payload, String field) {
        JsonNode n = payload == null ? null : payload.get(field);
        return n != null && n.isNumber() ? n.asDouble() : 0d;
    }

    static boolean bool(JsonNode payload, String field) {
        JsonNode n = payload == null ? null : payload.get(field);
        if (n == null || !n.isBoolean()) {
            throw new MalformedEventException("Field '" + field + "' is not a boolean");
        }
        return n.asBoolean();
    }

    static boolean optBool(JsonNode payload, String field, boolean dflt) {
        JsonNode n = payload == null ? null : payload.get(field);
        return n != null && n.isBoolean() ? n.asBoolean() : dflt;
    }
}
