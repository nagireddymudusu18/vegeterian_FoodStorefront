package in.foodapp.notification.infra.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import in.foodapp.notification.config.AppProperties;

/**
 * Decrypts the contacts in UserContactUpdated events (see contracts/events/UserContactUpdated.json):
 * base64(12-byte IV || AES-256-GCM ciphertext) under CONTACT_EVENT_KEY. The ciphertext is stored as received and
 * only decrypted at the moment a message is sent.
 */
@Component
public class ContactCipher {

    private static final Logger log = LoggerFactory.getLogger(ContactCipher.class);
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;

    @Autowired
    public ContactCipher(AppProperties props, Environment env) {
        this(resolve(props.contactEventKey(), env.acceptsProfiles(Profiles.of("local"))));
    }

    public ContactCipher(byte[] keyBytes) {
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
            try {
                return MessageDigest.getInstance("SHA-256")
                        .digest("dev-only-contact-event-key".getBytes(StandardCharsets.UTF_8));
            } catch (GeneralSecurityException e) {
                throw new IllegalStateException(e);
            }
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

    public String decrypt(String wire) {
        try {
            byte[] data = Base64.getDecoder().decode(wire);
            if (data.length <= IV_LEN) {
                throw new IllegalArgumentException("ciphertext too short");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_LEN));
            return new String(cipher.doFinal(data, IV_LEN, data.length - IV_LEN), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("contact decryption failed", e);
        }
    }

    /** Test helper and symmetric counterpart, so the wire format is defined in one place on this side too. */
    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            new java.security.SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] out = java.util.Arrays.copyOf(iv, IV_LEN + ct.length);
            System.arraycopy(ct, 0, out, IV_LEN, ct.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("encryption failed", e);
        }
    }
}
