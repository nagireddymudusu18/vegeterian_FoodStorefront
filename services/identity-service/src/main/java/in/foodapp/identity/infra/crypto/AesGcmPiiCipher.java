package in.foodapp.identity.infra.crypto;

import in.foodapp.identity.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public class AesGcmPiiCipher implements PiiCipher {

    private static final Logger log = LoggerFactory.getLogger(AesGcmPiiCipher.class);
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec encKey;
    private final SecretKeySpec hmacKey;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public AesGcmPiiCipher(AppProperties props, Environment env) {
        boolean local = env.acceptsProfiles(Profiles.of("local"));
        byte[] enc = resolve("PII_ENC_KEY", props.pii().encKey(), local, "dev-only-pii-enc-key");
        byte[] mac = resolve("PII_HMAC_KEY", props.pii().hmacKey(), local, "dev-only-pii-hmac-key");
        this.encKey = new SecretKeySpec(enc, "AES");
        this.hmacKey = new SecretKeySpec(mac, "HmacSHA256");
    }

    public AesGcmPiiCipher(byte[] encKeyBytes, byte[] hmacKeyBytes) {
        if (encKeyBytes.length != 32 || hmacKeyBytes.length != 32) {
            throw new IllegalArgumentException("PII keys must be 32 bytes");
        }
        this.encKey = new SecretKeySpec(encKeyBytes, "AES");
        this.hmacKey = new SecretKeySpec(hmacKeyBytes, "HmacSHA256");
    }

    private static byte[] resolve(String name, String value, boolean local, String devSeed) {
        if (value == null || value.isBlank()) {
            if (!local) {
                throw new IllegalStateException(name + " is required (base64, 32 bytes) outside the local profile");
            }
            log.warn("{} not set: using INSECURE development default. Never do this in production.", name);
            return sha256(devSeed);
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(value.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(name + " is not valid base64", e);
        }
        if (decoded.length != 32) {
            throw new IllegalStateException(name + " must decode to exactly 32 bytes, got " + decoded.length);
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

    @Override
    public byte[] encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encKey, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[IV_LEN + ct.length];
            System.arraycopy(iv, 0, out, 0, IV_LEN);
            System.arraycopy(ct, 0, out, IV_LEN, ct.length);
            return out;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("encryption failed", e);
        }
    }

    @Override
    public String decrypt(byte[] data) {
        try {
            if (data == null || data.length <= IV_LEN) {
                throw new IllegalArgumentException("ciphertext too short");
            }
            byte[] iv = Arrays.copyOfRange(data, 0, IV_LEN);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encKey, new GCMParameterSpec(TAG_BITS, iv));
            byte[] pt = cipher.doFinal(data, IV_LEN, data.length - IV_LEN);
            return new String(pt, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("decryption failed", e);
        }
    }

    @Override
    public String blindIndex(String value) {
        return hmacHex(value);
    }

    /** HMAC-SHA256 hex, also used for OTP code hashing (keyed, so low-entropy codes are not rainbow-able offline). */
    public String hmacHex(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
