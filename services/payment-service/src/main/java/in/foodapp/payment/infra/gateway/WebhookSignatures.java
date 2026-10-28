package in.foodapp.payment.infra.gateway;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;

/** HMAC-SHA256 helper shared by the gateways for webhook verification. */
public final class WebhookSignatures {

    private WebhookSignatures() {
    }

    public static String hmacSha256Hex(String secret, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    /** Constant-time verification. Returns false for blank secret / missing header. */
    public static boolean verify(String secret, String rawBody, String signatureHeader) {
        if (secret == null || secret.isBlank() || rawBody == null || signatureHeader == null
                || signatureHeader.isBlank()) {
            return false;
        }
        byte[] expected = hmacSha256Hex(secret, rawBody).getBytes(StandardCharsets.UTF_8);
        byte[] provided = signatureHeader.trim().toLowerCase().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, provided);
    }
}
