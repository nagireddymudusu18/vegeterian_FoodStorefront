package in.foodapp.notification;

import static org.assertj.core.api.Assertions.assertThat;

import in.foodapp.notification.domain.Message;
import in.foodapp.notification.infra.crypto.ContactCipher;
import in.foodapp.notification.persistence.NotificationStore;
import in.foodapp.notification.persistence.ReplicaStore;
import in.foodapp.notification.service.DeliveryDispatcher;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** The outbound queue: sends decrypted contacts, retries a failing provider, skips people with no contact. */
@SpringBootTest
@Import(RecordingSenders.class)
class DeliveryDispatcherTest {

    static final TestDatabase.Conn DB = TestDatabase.start("notification");
    private static final byte[] KEY = new byte[32];

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.contact-event-key", () -> Base64.getEncoder().encodeToString(KEY));
        r.add("app.messaging.dispatch-max-attempts", () -> "3");
        r.add("app.feed.identity-key", () -> "");
        r.add("app.feed.catalog-key", () -> "");
        r.add("app.feed.order-key", () -> "");
        r.add("app.feed.payment-key", () -> "");
        r.add("app.feed.fleet-key", () -> "");
        r.add("NOTIFY_DISPATCH_MS", () -> "3600000");
    }

    @Autowired
    DeliveryDispatcher dispatcher;
    @Autowired
    NotificationStore store;
    @Autowired
    ReplicaStore replicas;
    @Autowired
    JdbcTemplate jdbc;

    private final ContactCipher cipher = new ContactCipher(KEY);

    @AfterEach
    void reset() {
        RecordingSenders.failFor = null;
    }

    private UUID notify(UUID user, Message message) {
        store.createForUser(user, message, null, "dispatch:" + UUID.randomUUID());
        return jdbc.queryForObject("SELECT id FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
                UUID.class, user);
    }

    private Map<String, Object> delivery(UUID notification, String channel) {
        return jdbc.queryForMap("SELECT status, attempts, last_error FROM delivery WHERE notification_id = ? "
                + "AND channel = ?", notification, channel);
    }

    private void makeDueNow(UUID notification) {
        jdbc.update("UPDATE delivery SET next_attempt_at = now() WHERE notification_id = ?", notification);
    }

    @Test
    void sendsToTheDecryptedVerifiedContactsOnEachChannel() {
        UUID user = UUID.randomUUID();
        String phone = "+9190000" + (10000 + (int) (Math.random() * 89999));
        String email = "ravi" + user.toString().substring(0, 8) + "@example.com";
        replicas.upsertContact(user, cipher.encrypt(phone), cipher.encrypt(email));
        UUID n = notify(user, Message.inApp("ORDER_CANCELLED", "Order cancelled", "Order FA-1 was cancelled.")
                .withEmail().withSms());

        dispatcher.dispatchDue();

        assertThat(delivery(n, "EMAIL").get("status")).isEqualTo("SENT");
        assertThat(delivery(n, "SMS").get("status")).isEqualTo("SENT");
        assertThat(RecordingSenders.EMAIL).anySatisfy(s -> {
            assertThat(s.to()).isEqualTo(email);
            assertThat(s.subjectOrMessage()).isEqualTo("Order cancelled");
            assertThat(s.body()).isEqualTo("Order FA-1 was cancelled.");
        });
        assertThat(RecordingSenders.SMS).anySatisfy(s -> {
            assertThat(s.to()).isEqualTo(phone);
            assertThat(s.subjectOrMessage()).isEqualTo("Order cancelled. Order FA-1 was cancelled.");
        });
    }

    @Test
    void aSentDeliveryIsNeverSentAgain() {
        UUID user = UUID.randomUUID();
        String email = "once" + user.toString().substring(0, 8) + "@example.com";
        replicas.upsertContact(user, null, cipher.encrypt(email));
        notify(user, Message.inApp("ORDER_DELIVERED", "Delivered", "done").withEmail());

        dispatcher.dispatchDue();
        dispatcher.dispatchDue();

        assertThat(RecordingSenders.EMAIL.stream().filter(s -> s.to().equals(email))).hasSize(1);
    }

    @Test
    void aFailingProviderIsRetriedThenMarkedFailed() {
        UUID user = UUID.randomUUID();
        String marker = "flaky" + user.toString().substring(0, 8);
        replicas.upsertContact(user, null, cipher.encrypt(marker + "@example.com"));
        UUID n = notify(user, Message.inApp("ORDER_DELIVERED", "Delivered", "done").withEmail());
        RecordingSenders.failFor = marker;

        dispatcher.dispatchDue();
        Map<String, Object> first = delivery(n, "EMAIL");
        assertThat(first.get("status")).isEqualTo("PENDING");
        assertThat(first.get("attempts")).isEqualTo(1);
        assertThat((String) first.get("last_error")).contains("provider down");

        dispatcher.dispatchDue(); // not due yet: the retry waits
        assertThat(delivery(n, "EMAIL").get("attempts")).isEqualTo(1);

        makeDueNow(n);
        dispatcher.dispatchDue();
        makeDueNow(n);
        dispatcher.dispatchDue();
        assertThat(delivery(n, "EMAIL").get("status")).isEqualTo("FAILED");
        assertThat(delivery(n, "EMAIL").get("attempts")).isEqualTo(3);
    }

    @Test
    void aProviderThatRecoversDeliversOnTheRetry() {
        UUID user = UUID.randomUUID();
        String marker = "recover" + user.toString().substring(0, 8);
        replicas.upsertContact(user, null, cipher.encrypt(marker + "@example.com"));
        UUID n = notify(user, Message.inApp("ORDER_DELIVERED", "Delivered", "done").withEmail());
        RecordingSenders.failFor = marker;
        dispatcher.dispatchDue();

        RecordingSenders.failFor = null;
        makeDueNow(n);
        dispatcher.dispatchDue();

        assertThat(delivery(n, "EMAIL").get("status")).isEqualTo("SENT");
        assertThat(delivery(n, "EMAIL").get("attempts")).isEqualTo(2);
    }

    @Test
    void aPersonWithoutThatContactIsSkippedAfterTheRetriesButStillHasTheInboxMessage() {
        UUID user = UUID.randomUUID();
        replicas.upsertContact(user, null, cipher.encrypt("e" + user.toString().substring(0, 8) + "@example.com"));
        UUID n = notify(user, Message.inApp("ORDER_OUT_FOR_DELIVERY", "Out for delivery", "soon").withSms());

        for (int i = 0; i < 3; i++) {
            makeDueNow(n);
            dispatcher.dispatchDue();
        }

        assertThat(delivery(n, "SMS").get("status")).isEqualTo("SKIPPED");
        assertThat((String) delivery(n, "SMS").get("last_error")).contains("phone");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE id = ?", Integer.class, n)).isOne();
    }

    @Test
    void aContactThatArrivesLateIsStillUsed() {
        UUID user = UUID.randomUUID();
        UUID n = notify(user, Message.inApp("ORDER_DELIVERED", "Delivered", "done").withEmail());
        dispatcher.dispatchDue();
        assertThat(delivery(n, "EMAIL").get("status")).isEqualTo("PENDING");

        String email = "late" + user.toString().substring(0, 8) + "@example.com";
        replicas.upsertContact(user, null, cipher.encrypt(email));
        makeDueNow(n);
        dispatcher.dispatchDue();

        assertThat(delivery(n, "EMAIL").get("status")).isEqualTo("SENT");
        assertThat(RecordingSenders.EMAIL.stream().anyMatch(s -> s.to().equals(email))).isTrue();
    }
}
