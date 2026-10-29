package in.foodapp.order.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Retry counters for failing feed events, and the dead-letter table for events that are parked. */
@Repository
public class FeedFailureStore {

    public record DeadLetter(long id, String source, long eventId, String eventType, UUID aggregateId,
                             String payload, String error, int attempts, Instant parkedAt, String resolution) {
    }

    private static final int MAX_ERROR_LENGTH = 2000;

    private final JdbcTemplate jdbc;

    public FeedFailureStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static String clip(String error) {
        if (error == null) {
            return "unknown error";
        }
        return error.length() <= MAX_ERROR_LENGTH ? error : error.substring(0, MAX_ERROR_LENGTH);
    }

    /** Counts one more failed attempt for the event and returns the total so far. */
    public int recordFailure(String source, long eventId, String error) {
        Integer attempts = jdbc.queryForObject(
                "INSERT INTO feed_failure(source, event_id, attempts, last_error) VALUES (?, ?, 1, ?) "
                        + "ON CONFLICT (source, event_id) DO UPDATE SET attempts = feed_failure.attempts + 1, "
                        + "last_error = EXCLUDED.last_error, updated_at = now() RETURNING attempts",
                Integer.class, source, eventId, clip(error));
        return attempts == null ? 1 : attempts;
    }

    public void clearFailure(String source, long eventId) {
        jdbc.update("DELETE FROM feed_failure WHERE source = ? AND event_id = ?", source, eventId);
    }

    /** Retry counters at or below the cursor are obsolete: those events have been applied or parked. */
    public void clearFailuresUpTo(String source, long eventId) {
        jdbc.update("DELETE FROM feed_failure WHERE source = ? AND event_id <= ?", source, eventId);
    }

    public void park(String source, long eventId, String eventType, UUID aggregateId, String payloadJson,
                     String error, int attempts) {
        jdbc.update("INSERT INTO feed_dead_letter(source, event_id, event_type, aggregate_id, payload, error, attempts) "
                        + "VALUES (?, ?, ?, ?, ?::jsonb, ?, ?) ON CONFLICT (source, event_id) DO NOTHING",
                source, eventId, eventType, aggregateId, payloadJson, clip(error), attempts);
    }

    private static final String COLUMNS =
            "id, source, event_id, event_type, aggregate_id, payload::text AS payload, error, attempts, parked_at, "
                    + "resolution";

    private static DeadLetter map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new DeadLetter(rs.getLong("id"), rs.getString("source"), rs.getLong("event_id"),
                rs.getString("event_type"), rs.getObject("aggregate_id", UUID.class), rs.getString("payload"),
                rs.getString("error"), rs.getInt("attempts"), rs.getTimestamp("parked_at").toInstant(),
                rs.getString("resolution"));
    }

    public List<DeadLetter> open(int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM feed_dead_letter WHERE resolved_at IS NULL "
                + "ORDER BY parked_at, id LIMIT ?", (rs, i) -> map(rs), limit);
    }

    public long countOpen() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM feed_dead_letter WHERE resolved_at IS NULL", Long.class);
        return n == null ? 0 : n;
    }

    /** An open (unresolved) dead letter. */
    public Optional<DeadLetter> findOpen(long id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM feed_dead_letter WHERE id = ? AND resolved_at IS NULL",
                (rs, i) -> map(rs), id).stream().findFirst();
    }

    /** Marks an open dead letter resolved (RETRIED or DISCARDED); false if it was not open. */
    public boolean resolve(long id, String resolution) {
        return jdbc.update("UPDATE feed_dead_letter SET resolved_at = now(), resolution = ? "
                + "WHERE id = ? AND resolved_at IS NULL", resolution, id) == 1;
    }
}
