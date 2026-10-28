package in.foodapp.payment.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/** Writes events to the outbox in the caller's transaction (MANDATORY). */
@Service
public class OutboxService {

    /** Constant key for the outbox insert advisory lock (serialises writers so ids commit in order). */
    public static final long OUTBOX_LOCK_KEY = 84_004_001L;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public OutboxService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(String type, UUID aggregateId, Map<String, Object> payload) {
        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot serialise outbox payload", e);
        }
        jdbc.query("SELECT pg_advisory_xact_lock(?)", (RowCallbackHandler) rs -> { }, OUTBOX_LOCK_KEY);
        jdbc.update("INSERT INTO outbox (type, aggregate_id, payload) VALUES (?, ?, CAST(? AS jsonb))",
                type, aggregateId, json);
    }
}
