package in.foodapp.notification.service;

import in.foodapp.notification.config.AppProperties;
import in.foodapp.notification.infra.crypto.ContactCipher;
import in.foodapp.notification.infra.email.EmailSender;
import in.foodapp.notification.infra.sms.SmsSender;
import in.foodapp.notification.persistence.ReplicaStore;
import io.micrometer.core.instrument.Metrics;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends the queued emails and texts. Events only add rows to {@code delivery}; this loop sends them, so a slow or
 * failing provider never holds up event processing, and a failed send is retried with a growing delay. A contact that
 * is not known yet (its event may still be in flight) is retried the same way, then the delivery is SKIPPED.
 */
@Component
public class DeliveryDispatcher {

    private static final Logger log = LoggerFactory.getLogger(DeliveryDispatcher.class);
    private static final int BATCH = 25;
    private static final int RETRY_BASE_SECONDS = 30;

    private record Due(long id, String channel, int attempts, UUID userId, String kind, String title, String body) {
    }

    /** The person has no verified contact for this channel. */
    private static final class NoContact extends RuntimeException {
        NoContact(String message) {
            super(message);
        }
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ReplicaStore replicas;
    private final ContactCipher cipher;
    private final SmsSender sms;
    private final EmailSender email;
    private final int maxAttempts;

    public DeliveryDispatcher(JdbcTemplate jdbc, TransactionTemplate tx, ReplicaStore replicas, ContactCipher cipher,
                              SmsSender sms, EmailSender email, AppProperties props) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.replicas = replicas;
        this.cipher = cipher;
        this.sms = sms;
        this.email = email;
        this.maxAttempts = Math.max(1, props.messaging().dispatchMaxAttempts());
    }

    @Scheduled(fixedDelayString = "${NOTIFY_DISPATCH_MS:3000}")
    public void dispatchDue() {
        try {
            List<Long> ids = jdbc.queryForList("SELECT id FROM delivery WHERE status = 'PENDING' "
                    + "AND next_attempt_at <= now() ORDER BY id LIMIT " + BATCH, Long.class);
            for (long id : ids) {
                tx.executeWithoutResult(s -> dispatchOne(id));
            }
        } catch (RuntimeException e) {
            log.error("Delivery dispatch failed, will retry", e);
        }
    }

    /** Claims one pending delivery (skipping rows another instance holds), sends it and records the outcome. */
    private void dispatchOne(long id) {
        Optional<Due> claimed = jdbc.query("SELECT d.id, d.channel, d.attempts, n.user_id, n.kind, n.title, n.body "
                        + "FROM delivery d JOIN notification n ON n.id = d.notification_id "
                        + "WHERE d.id = ? AND d.status = 'PENDING' FOR UPDATE OF d SKIP LOCKED",
                (rs, i) -> new Due(rs.getLong("id"), rs.getString("channel"), rs.getInt("attempts"),
                        rs.getObject("user_id", UUID.class), rs.getString("kind"), rs.getString("title"),
                        rs.getString("body")), id).stream().findFirst();
        if (claimed.isEmpty()) {
            return;
        }
        Due due = claimed.get();
        try {
            send(due);
            jdbc.update("UPDATE delivery SET status = 'SENT', attempts = attempts + 1, sent_at = now(), "
                    + "last_error = NULL WHERE id = ?", due.id());
            Metrics.counter("notification.delivery", "channel", due.channel(), "outcome", "sent").increment();
        } catch (NoContact e) {
            fail(due, e.getMessage(), "SKIPPED");
        } catch (RuntimeException e) {
            log.warn("Sending {} for delivery {} failed: {}", due.channel(), due.id(), e.toString());
            fail(due, e.toString(), "FAILED");
        }
    }

    private void send(Due due) {
        ReplicaStore.Contact contact = replicas.contact(due.userId()).orElseThrow(() ->
                new NoContact("No verified contact known for the recipient"));
        if ("SMS".equals(due.channel())) {
            if (contact.phoneEnc() == null) {
                throw new NoContact("No verified phone number");
            }
            sms.send(cipher.decrypt(contact.phoneEnc()), due.title() + ". " + due.body());
        } else {
            if (contact.emailEnc() == null) {
                throw new NoContact("No verified email address");
            }
            email.send(cipher.decrypt(contact.emailEnc()), due.title(), due.body());
        }
    }

    private void fail(Due due, String error, String finalStatus) {
        int attempts = due.attempts() + 1;
        if (attempts >= maxAttempts) {
            jdbc.update("UPDATE delivery SET status = ?, attempts = ?, last_error = ? WHERE id = ?",
                    finalStatus, attempts, clip(error), due.id());
            Metrics.counter("notification.delivery", "channel", due.channel(),
                    "outcome", finalStatus.toLowerCase()).increment();
            return;
        }
        jdbc.update("UPDATE delivery SET attempts = ?, last_error = ?, "
                        + "next_attempt_at = now() + make_interval(secs => ?) WHERE id = ?",
                attempts, clip(error), (double) RETRY_BASE_SECONDS * attempts * attempts, due.id());
    }

    private static String clip(String error) {
        return error == null ? "unknown error" : error.length() <= 500 ? error : error.substring(0, 500);
    }
}
