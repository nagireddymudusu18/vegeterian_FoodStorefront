package in.foodapp.payment.events;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.payment.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Pull feed of outbox events, per contracts/CONVENTIONS.md. Not routed by the edge. */
@RestController
public class FeedController {

    public record FeedEvent(long id, String type, UUID aggregateId, Instant occurredAt, JsonNode payload) {
    }

    public record FeedResponse(List<FeedEvent> events, long nextCursor) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final String feedKey;

    public FeedController(JdbcTemplate jdbc, ObjectMapper objectMapper,
                          @Value("${app.internal-feed-key}") String feedKey) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.feedKey = feedKey;
    }

    @GetMapping("/internal/events")
    @Transactional(readOnly = true)
    public FeedResponse events(@RequestParam(name = "after", defaultValue = "0") long after,
                               @RequestParam(name = "limit", defaultValue = "100") int limit,
                               @RequestHeader(name = "X-Internal-Key", required = false) String key) {
        if (!keyMatches(key)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized", "Missing or invalid X-Internal-Key");
        }
        int effectiveLimit = Math.max(1, Math.min(500, limit));
        List<FeedEvent> events = jdbc.query(
                "SELECT id, type, aggregate_id, payload::text AS payload, occurred_at FROM outbox WHERE id > ? ORDER BY id ASC LIMIT ?",
                (rs, i) -> {
                    try {
                        return new FeedEvent(rs.getLong("id"), rs.getString("type"),
                                rs.getObject("aggregate_id", UUID.class),
                                rs.getTimestamp("occurred_at").toInstant(),
                                objectMapper.readTree(rs.getString("payload")));
                    } catch (java.io.IOException e) {
                        throw new IllegalStateException("corrupt outbox payload", e);
                    }
                }, after, effectiveLimit);
        long next = events.isEmpty() ? after : events.get(events.size() - 1).id();
        return new FeedResponse(events, next);
    }

    private boolean keyMatches(String provided) {
        if (provided == null || feedKey == null || feedKey.isEmpty()) {
            return false;
        }
        return MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8), feedKey.getBytes(StandardCharsets.UTF_8));
    }
}
