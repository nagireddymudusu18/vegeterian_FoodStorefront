package in.foodapp.payment.events.consumer;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Consumer-side DTOs for the producers' /internal/events feed (each consumer owns its own copy). */
public final class FeedDtos {

    private FeedDtos() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FeedEvent(long id, String type, UUID aggregateId, Instant occurredAt, JsonNode payload) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FeedPage(List<FeedEvent> events, long nextCursor) {

        public List<FeedEvent> safeEvents() {
            return events == null ? List.of() : events;
        }
    }
}
