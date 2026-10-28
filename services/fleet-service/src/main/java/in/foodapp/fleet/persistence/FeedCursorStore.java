package in.foodapp.fleet.persistence;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Persistence of feed_cursor(source, last_id). Must be called inside the batch transaction. */
@Repository
public class FeedCursorStore {

    private final JdbcTemplate jdbc;

    public FeedCursorStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long get(String source) {
        List<Long> rows = jdbc.query("SELECT last_id FROM feed_cursor WHERE source = ?",
                (rs, i) -> rs.getLong(1), source);
        return rows.isEmpty() ? 0L : rows.get(0);
    }

    public void set(String source, long lastId) {
        jdbc.update("INSERT INTO feed_cursor(source, last_id) VALUES (?, ?) "
                + "ON CONFLICT (source) DO UPDATE SET last_id = EXCLUDED.last_id", source, lastId);
    }
}
