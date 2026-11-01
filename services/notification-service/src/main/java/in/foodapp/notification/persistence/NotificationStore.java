package in.foodapp.notification.persistence;

import in.foodapp.notification.domain.Message;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Inbox rows, their read marks and the queue of outbound email/SMS. Call inside a transaction when writing. */
@Repository
public class NotificationStore {

    public record Item(UUID id, String kind, String title, String body, UUID orderId, Instant createdAt,
                       boolean read) {
    }

    private final JdbcTemplate jdbc;

    public NotificationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Adds a notification for one user and queues its outbound channels. {@code dedupeKey} makes it idempotent:
     * replaying the same event does nothing the second time.
     *
     * @return true if it was created, false if it already existed
     */
    public boolean createForUser(UUID userId, Message message, UUID orderId, String dedupeKey) {
        UUID id = UUID.randomUUID();
        int inserted = jdbc.update("INSERT INTO notification(id, user_id, kind, title, body, order_id, dedupe_key) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dedupe_key) DO NOTHING",
                id, userId, message.kind(), message.title(), message.body(), orderId, dedupeKey);
        if (inserted == 0) {
            return false;
        }
        for (Message.Channel channel : message.outbound()) {
            jdbc.update("INSERT INTO delivery(notification_id, channel) VALUES (?, ?)", id, channel.name());
        }
        return true;
    }

    /** Adds a notification for everyone holding a role (for example PARTNER). It has no outbound channels. */
    public boolean createForAudience(String audience, Message message, UUID orderId, String dedupeKey) {
        return jdbc.update("INSERT INTO notification(id, audience, kind, title, body, order_id, dedupe_key) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dedupe_key) DO NOTHING",
                UUID.randomUUID(), audience, message.kind(), message.title(), message.body(), orderId,
                dedupeKey) == 1;
    }

    /** Removes a notification (and its read marks) that is no longer true, for example a job someone has taken. */
    public boolean withdraw(String dedupeKey) {
        return jdbc.update("DELETE FROM notification WHERE dedupe_key = ?", dedupeKey) > 0;
    }

    /** SQL condition (with its arguments) for "addressed to this user, or broadcast to one of their roles". */
    private static String visible(UUID userId, Collection<String> audiences, int ttlMinutes, List<Object> args) {
        args.add(userId);
        if (audiences.isEmpty()) {
            return "n.user_id = ?";
        }
        args.addAll(audiences);
        args.add(ttlMinutes);
        return "(n.user_id = ? OR (n.audience IN (" + "?,".repeat(audiences.size() - 1) + "?) "
                + "AND n.created_at > now() - make_interval(mins => ?)))";
    }

    private static final String IS_READ = "CASE WHEN n.user_id IS NOT NULL THEN n.read_at IS NOT NULL "
            + "ELSE r.notification_id IS NOT NULL END";

    public List<Item> list(UUID userId, Collection<String> audiences, int ttlMinutes, int limit) {
        List<Object> args = new ArrayList<>();
        args.add(userId);
        String where = visible(userId, audiences, ttlMinutes, args);
        args.add(limit);
        return jdbc.query("SELECT n.id, n.kind, n.title, n.body, n.order_id, n.created_at, " + IS_READ + " AS is_read "
                        + "FROM notification n LEFT JOIN notification_read r "
                        + "ON r.notification_id = n.id AND r.user_id = ? WHERE " + where
                        + " ORDER BY n.created_at DESC, n.id DESC LIMIT ?",
                (rs, i) -> new Item(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("title"),
                        rs.getString("body"), rs.getObject("order_id", UUID.class),
                        rs.getTimestamp("created_at").toInstant(), rs.getBoolean("is_read")),
                args.toArray());
    }

    public long unread(UUID userId, Collection<String> audiences, int ttlMinutes) {
        List<Object> args = new ArrayList<>();
        args.add(userId);
        String where = visible(userId, audiences, ttlMinutes, args);
        Long n = jdbc.queryForObject("SELECT count(*) FROM notification n LEFT JOIN notification_read r "
                + "ON r.notification_id = n.id AND r.user_id = ? WHERE " + where + " AND NOT (" + IS_READ + ")",
                Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /** @return false when the notification does not exist or is not visible to this user */
    public boolean markRead(UUID userId, Collection<String> audiences, int ttlMinutes, UUID id) {
        List<Object> args = new ArrayList<>();
        String where = visible(userId, audiences, ttlMinutes, args);
        args.add(id);
        Integer visible = jdbc.queryForObject("SELECT count(*) FROM notification n WHERE " + where + " AND n.id = ?",
                Integer.class, args.toArray());
        if (visible == null || visible == 0) {
            return false;
        }
        jdbc.update("UPDATE notification SET read_at = now() WHERE id = ? AND user_id = ? AND read_at IS NULL",
                id, userId);
        jdbc.update("INSERT INTO notification_read(notification_id, user_id) "
                + "SELECT id, ? FROM notification WHERE id = ? AND audience IS NOT NULL ON CONFLICT DO NOTHING",
                userId, id);
        return true;
    }

    public void markAllRead(UUID userId, Collection<String> audiences, int ttlMinutes) {
        jdbc.update("UPDATE notification SET read_at = now() WHERE user_id = ? AND read_at IS NULL", userId);
        if (audiences.isEmpty()) {
            return;
        }
        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.addAll(audiences);
        args.add(ttlMinutes);
        jdbc.update("INSERT INTO notification_read(notification_id, user_id) SELECT id, ? FROM notification "
                + "WHERE audience IN (" + "?,".repeat(audiences.size() - 1) + "?) "
                + "AND created_at > now() - make_interval(mins => ?) ON CONFLICT DO NOTHING", args.toArray());
    }

    /** DPDP erasure: removes the user's inbox, read marks and queued messages (deliveries cascade). */
    public void deleteAllFor(UUID userId) {
        jdbc.update("DELETE FROM notification WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM notification_read WHERE user_id = ?", userId);
    }

    /** Retention: drops notifications (and their deliveries and read marks) older than the cut-off. */
    public int deleteOlderThan(Instant cutoff) {
        return jdbc.update("DELETE FROM notification WHERE created_at < ?", java.sql.Timestamp.from(cutoff));
    }
}
