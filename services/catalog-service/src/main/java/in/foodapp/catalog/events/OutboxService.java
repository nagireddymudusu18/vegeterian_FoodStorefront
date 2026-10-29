package in.foodapp.catalog.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Writes events to the outbox inside the caller's transaction and serves the pull feed. */
@Service
public class OutboxService {

    /** Constant advisory-lock key serialising outbox inserts (see CONVENTIONS.md). */
    static final long OUTBOX_LOCK_KEY = 7_283_001L;

    public record FeedEvent(long id, String type, UUID aggregateId, Instant occurredAt, JsonNode payload) {
    }

    public record Feed(List<FeedEvent> events, long nextCursor) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ObjectProvider<OutboxValidator> validators;

    public OutboxService(JdbcTemplate jdbc, ObjectMapper mapper, ObjectProvider<OutboxValidator> validators) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.validators = validators;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(String type, UUID aggregateId, Map<String, Object> payload) {
        String json;
        try {
            json = mapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise outbox payload", e);
        }
        validators.orderedStream().forEach(v -> v.validate(type, json));
        jdbc.query("SELECT pg_advisory_xact_lock(?)", rs -> {
        }, OUTBOX_LOCK_KEY);
        jdbc.update("INSERT INTO outbox (type, aggregate_id, payload) VALUES (?, ?, CAST(? AS jsonb))",
                type, aggregateId, json);
    }

    @Transactional(readOnly = true)
    public Feed read(long after, int limit) {
        List<FeedEvent> events = jdbc.query(
                "SELECT id, type, aggregate_id, payload::text AS payload, occurred_at FROM outbox "
                        + "WHERE id > ? ORDER BY id ASC LIMIT ?",
                (rs, n) -> {
                    JsonNode payload;
                    try {
                        payload = mapper.readTree(rs.getString("payload"));
                    } catch (JsonProcessingException e) {
                        throw new IllegalStateException("Corrupt outbox payload", e);
                    }
                    OffsetDateTime at = rs.getObject("occurred_at", OffsetDateTime.class);
                    return new FeedEvent(rs.getLong("id"), rs.getString("type"),
                            rs.getObject("aggregate_id", UUID.class), at.toInstant(), payload);
                },
                after, limit);
        long next = events.isEmpty() ? after : events.get(events.size() - 1).id();
        return new Feed(events, next);
    }
}
