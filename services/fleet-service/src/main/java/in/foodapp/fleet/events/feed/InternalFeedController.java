package in.foodapp.fleet.events.feed;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.fleet.api.ApiException;
import in.foodapp.fleet.config.AppProperties;
import in.foodapp.fleet.events.outbox.OutboxService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Producer side of the event feed (CONVENTIONS "Event feed"). Not routed by the edge; guarded by X-Internal-Key. */
@RestController
@RequestMapping("/internal")
public class InternalFeedController {

    public record FeedEvent(long id, String type, UUID aggregateId, Instant occurredAt, JsonNode payload) {
    }

    public record FeedResponse(List<FeedEvent> events, long nextCursor) {
    }

    private final OutboxService outbox;
    private final AppProperties props;

    public InternalFeedController(OutboxService outbox, AppProperties props) {
        this.outbox = outbox;
        this.props = props;
    }

    @GetMapping("/events")
    public FeedResponse events(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestParam(name = "after", defaultValue = "0") long after,
            @RequestParam(name = "limit", defaultValue = "100") int limit) {
        if (!keyMatches(key)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized", "Invalid or missing X-Internal-Key");
        }
        int boundedLimit = Math.max(1, Math.min(500, limit));
        long boundedAfter = Math.max(0, after);
        List<FeedEvent> events = outbox.read(boundedAfter, boundedLimit).stream()
                .map(r -> new FeedEvent(r.id(), r.type(), r.aggregateId(), r.occurredAt(), r.payload()))
                .toList();
        long next = events.isEmpty() ? boundedAfter : events.get(events.size() - 1).id();
        return new FeedResponse(events, next);
    }

    private boolean keyMatches(String provided) {
        String expected = props.internalFeedKey();
        if (expected == null || expected.isBlank() || provided == null) {
            return false;
        }
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }
}
