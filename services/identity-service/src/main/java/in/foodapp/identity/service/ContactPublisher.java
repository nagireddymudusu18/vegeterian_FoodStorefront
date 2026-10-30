package in.foodapp.identity.service;

import in.foodapp.identity.events.OutboxService;
import in.foodapp.identity.infra.crypto.ContactEventCipher;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.persistence.User;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Tells other services (notification-service) about a user's VERIFIED contact details through the outbox. The
 * values travel encrypted with the contact-event key; unverified emails are never published.
 */
@Service
public class ContactPublisher {

    private final OutboxService outbox;
    private final PiiCipher pii;
    private final ContactEventCipher eventCipher;

    public ContactPublisher(OutboxService outbox, PiiCipher pii, ContactEventCipher eventCipher) {
        this.outbox = outbox;
        this.pii = pii;
        this.eventCipher = eventCipher;
    }

    /** Call inside the transaction that changed the contact. */
    public void phoneChanged(User user) {
        if (user.getPhoneEnc() != null) {
            publish(user, "phoneEnc", pii.decrypt(user.getPhoneEnc()));
        }
    }

    /** Call inside the transaction that verified the email. */
    public void emailVerified(User user) {
        if (user.getEmailEnc() != null && user.isEmailVerified()) {
            publish(user, "emailEnc", pii.decrypt(user.getEmailEnc()));
        }
    }

    private void publish(User user, String field, String plaintext) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", user.getId().toString());
        payload.put(field, eventCipher.encrypt(plaintext));
        outbox.publish("UserContactUpdated", user.getId(), payload);
    }
}
