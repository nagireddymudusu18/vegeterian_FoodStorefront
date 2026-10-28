package in.foodapp.identity.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxService {

    /** Constant key serialising outbox inserts so ids become visible in order. */
    private static final long OUTBOX_LOCK_KEY = 8101L;

    public record FeedEvent(long id, String type, UUID aggregateId, String occurredAt, JsonNode payload) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public OutboxService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    /** Must be called inside the same transaction as the state change. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(String type, UUID aggregateId, Map<String, Object> payload) {
        jdbc.query("select pg_advisory_xact_lock(?)", (RowCallbackHandler) rs -> {
        }, OUTBOX_LOCK_KEY);
        String json;
        try {
            json = mapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        jdbc.update("insert into outbox (type, aggregate_id, payload) values (?, ?, ?::jsonb)",
                type, aggregateId, json);
    }

    @Transactional(readOnly = true)
    public List<FeedEvent> readAfter(long after, int limit) {
        return jdbc.query(
                "select id, type, aggregate_id, payload::text as payload, occurred_at "
                        + "from outbox where id > ? order by id asc limit ?",
                (rs, i) -> {
                    try {
                        OffsetDateTime at = rs.getObject("occurred_at", OffsetDateTime.class);
                        return new FeedEvent(
                                rs.getLong("id"),
                                rs.getString("type"),
                                rs.getObject("aggregate_id", UUID.class),
                                at.toInstant().toString(),
                                mapper.readTree(rs.getString("payload")));
                    } catch (JsonProcessingException e) {
                        throw new IllegalStateException(e);
                    }
                },
                after, limit);
    }
}
