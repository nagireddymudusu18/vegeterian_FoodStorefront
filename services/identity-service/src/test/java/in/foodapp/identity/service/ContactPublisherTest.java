package in.foodapp.identity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import in.foodapp.identity.events.OutboxService;
import in.foodapp.identity.infra.crypto.AesGcmPiiCipher;
import in.foodapp.identity.infra.crypto.ContactEventCipher;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.persistence.User;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ContactPublisherTest {

    private static byte[] key(int fill) {
        byte[] k = new byte[32];
        Arrays.fill(k, (byte) fill);
        return k;
    }

    private static String decode(String wire, byte[] keyBytes) throws Exception {
        byte[] data = Base64.getDecoder().decode(wire);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(128, data, 0, 12));
        return new String(c.doFinal(data, 12, data.length - 12), StandardCharsets.UTF_8);
    }

    private OutboxService outbox;
    private PiiCipher pii;
    private ContactPublisher publisher;

    @BeforeEach
    void setUp() {
        outbox = mock(OutboxService.class);
        pii = new AesGcmPiiCipher(key(1), key(2));
        ContactEventCipher eventCipher = new ContactEventCipher(key(7));
        publisher = new ContactPublisher(outbox, pii, eventCipher);
    }

    @Test
    void backfillPublishesVerifiedPhoneAndEmail() throws Exception {
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
        assertThat(decode((String) payload.get("phoneEnc"), key(7))).isEqualTo("+919811100001");
        assertThat(decode((String) payload.get("emailEnc"), key(7))).isEqualTo("asha@example.com");
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

