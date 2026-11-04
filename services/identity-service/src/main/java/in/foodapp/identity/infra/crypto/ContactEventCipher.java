package in.foodapp.identity.infra.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Encrypts a contact (phone or email) for the UserContactUpdated event, so the outbox and the feed never hold it in
 * plain text. The key (CONTACT_EVENT_KEY) is shared only with notification-service and is separate from PII_ENC_KEY,
 * so the identity database keys stay private to this service. Output: base64(12-byte IV || AES-256-GCM ciphertext).
 */
@Component
public class ContactEventCipher {

    private static final Logger log = LoggerFactory.getLogger(ContactEventCipher.class);
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public ContactEventCipher(@Value("${CONTACT_EVENT_KEY:}") String configured, Environment env) {
        this(resolve(configured, env.acceptsProfiles(Profiles.of("local"))));
    }

    public ContactEventCipher(byte[] keyBytes) {
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("CONTACT_EVENT_KEY must be 32 bytes");
        }
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    private static byte[] resolve(String value, boolean local) {
        if (value == null || value.isBlank()) {
            if (!local) {
                throw new IllegalStateException("CONTACT_EVENT_KEY is required (base64, 32 bytes) outside the local profile");
            }
            log.warn("CONTACT_EVENT_KEY not set: using INSECURE development default. Never do this in production.");
            return sha256("dev-only-contact-event-key");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(value.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("CONTACT_EVENT_KEY is not valid base64", e);
        }
        if (decoded.length != 32) {
            throw new IllegalStateException("CONTACT_EVENT_KEY must decode to exactly 32 bytes, got " + decoded.length);
        }
        return decoded;
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] out = Arrays.copyOf(iv, IV_LEN + ct.length);
            System.arraycopy(ct, 0, out, IV_LEN, ct.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("encryption failed", e);
        }
    }
}
