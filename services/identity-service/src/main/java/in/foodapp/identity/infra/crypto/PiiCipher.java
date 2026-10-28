package in.foodapp.identity.infra.crypto;

public interface PiiCipher {

    /** AES-256-GCM encrypt; output = 12-byte random IV || ciphertext || tag. */
    byte[] encrypt(String plaintext);

    String decrypt(byte[] ciphertext);

    /** Deterministic HMAC-SHA256 blind index (lower-case hex), usable for equality lookup. */
    String blindIndex(String value);
}
