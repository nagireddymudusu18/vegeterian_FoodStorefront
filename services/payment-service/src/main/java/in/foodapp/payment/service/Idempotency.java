package in.foodapp.payment.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Idempotency helpers: a request fingerprint is stored with the first use of an Idempotency-Key.
 * A replay with the same key and same fingerprint returns the stored result; same key with a
 * different fingerprint is a conflict (HTTP 422).
 */
public final class Idempotency {

    private Idempotency() {
    }

    public static String paymentHash(UUID orderId, long amountPaise) {
        return sha256Hex("payment|" + orderId + "|" + amountPaise);
    }

    public static String refundHash(UUID paymentId, long amountPaise) {
        return sha256Hex("refund|" + paymentId + "|" + amountPaise);
    }

    /** @return true when the stored fingerprint equals the incoming one (i.e. a legitimate replay). */
    public static boolean isReplay(String storedHash, String incomingHash) {
        return storedHash != null && MessageDigest.isEqual(
                storedHash.getBytes(StandardCharsets.UTF_8), incomingHash.getBytes(StandardCharsets.UTF_8));
    }

    static String sha256Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
