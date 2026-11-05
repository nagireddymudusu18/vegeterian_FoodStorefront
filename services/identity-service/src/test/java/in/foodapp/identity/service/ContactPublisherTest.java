package in.foodapp.identity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import in.foodapp.identity.config.AppProperties;
import in.foodapp.identity.events.OutboxService;
import in.foodapp.identity.infra.crypto.ContactEventCipher;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.persistence.User;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ContactPublisherTest {

    private OutboxService outbox;
    private PiiCipher pii;
    private ContactEventCipher eventCipher;
    private ContactPublisher publisher;

    @BeforeEach
    void setUp() {
        outbox = mock(OutboxService.class);
        String key32 = Base64.getEncoder().encodeToString(new byte[32]);
        AppProperties props = new AppProperties(
                new AppProperties.Jwt("https://veggoeats.in", null, null, 15, 30),
                new AppProperties.Pii(key32, key32, key32),
                new AppProperties.Otp("logging", 300, 5),
                new AppProperties.Email("logging", "https://veggoeats.in"),
                new AppProperties.Admin("admin@veggoeats.in"),
                new AppProperties.Internal("feed-key"));
        pii = new PiiCipher(props);
        eventCipher = new ContactEventCipher(props);
        publisher = new ContactPublisher(outbox, pii, eventCipher);
    }

    @Test
    void backfillPublishesVerifiedPhoneAndEmail() {
        UUID id = UUID.randomUUID();
        User user = new User(id, pii.encrypt("+919811100001"), "h-phone", new String[]{"CUSTOMER"}, Instant.now());
        user.setCredentials(pii.encrypt("asha@example.com"), "h-email", "pw-hash");
        user.markEmailVerified();

        boolean published = publisher.backfillUser(user);

        assertThat(published).isTrue();
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(outbox).publish(eq("UserContactUpdated"), eq(id), cap.capture());
        Map<String, Object> payload = cap.getValue();
        assertThat(payload.get("userId")).isEqualTo(id.toString());
        assertThat(eventCipher.decrypt((String) payload.get("phoneEnc"))).isEqualTo("+919811100001");
        assertThat(eventCipher.decrypt((String) payload.get("emailEnc"))).isEqualTo("asha@example.com");
    }

    @Test
    void backfillSkipsUnverifiedEmailAndDeletedUsers() {
        UUID id = UUID.randomUUID();
        User unverified = new User(id, null, null, new String[]{"CUSTOMER"}, Instant.now());
        unverified.setCredentials(pii.encrypt("pending@example.com"), "h-email", "pw-hash");

        assertThat(publisher.backfillUser(unverified)).isFalse();

        User deleted = new User(UUID.randomUUID(), pii.encrypt("+919811100002"), "h2", new String[]{"CUSTOMER"}, Instant.now());
        deleted.markDeleted(Instant.now());
        assertThat(publisher.backfillUser(deleted)).isFalse();

        verifyNoInteractions(outbox);
    }
}
