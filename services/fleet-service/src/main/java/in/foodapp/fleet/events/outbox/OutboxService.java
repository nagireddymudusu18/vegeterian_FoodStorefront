package in.foodapp.fleet.events.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Writes to / reads from the transactional outbox (CONVENTIONS "Event feed"). */
@Service
public class OutboxService {

    /** Constant key for pg_advisory_xact_lock; serialises outbox inserts so ids become visible in order. */
    static final long OUTBOX_LOCK_KEY = 8_085_001L;

    public record OutboxRow(long id, String type, UUID aggregateId, Instant occurredAt, JsonNode payload) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public OutboxService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    /** Must run inside the same transaction as the state change. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void append(String type, UUID aggregateId, Map<String, Object> payload) {
        jdbc.execute("SELECT pg_advisory_xact_lock(" + OUTBOX_LOCK_KEY + ")");
        String json;
        try {
            json = mapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise outbox payload", e);
        }
        jdbc.update("INSERT INTO outbox(type, aggregate_id, payload) VALUES (?, ?, ?::jsonb)",
                type, aggregateId, json);
    }

    @Transactional(readOnly = true)
    public List<OutboxRow> read(long after, int limit) {
        return jdbc.query(
                "SELECT id, type, aggregate_id, payload::text AS payload, occurred_at FROM outbox "
                        + "WHERE id > ? ORDER BY id ASC LIMIT ?",
                (rs, i) -> {
                    try {
                        return new OutboxRow(
                                rs.getLong("id"),
                                rs.getString("type"),
                                rs.getObject("aggregate_id", UUID.class),
                                rs.getTimestamp("occurred_at").toInstant(),
                                mapper.readTree(rs.getString("payload")));
                    } catch (JsonProcessingException e) {
                        throw new IllegalStateException("Corrupt outbox payload", e);
                    }
                },
                after, limit);
    }
}
