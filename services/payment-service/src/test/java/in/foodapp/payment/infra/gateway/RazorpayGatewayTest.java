package in.foodapp.payment.infra.gateway;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RazorpayGatewayTest {

    private static final String SECRET = "whsec_test_secret";
    private static final String BODY = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_1\",\"amount\":50000}}}}";

    private final RazorpayGateway gateway = new RazorpayGateway("key", "secret", SECRET);

    /** Independent computation of the expected signature (does not use the production helper). */
    private static String expectedSignature(String secret, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void acceptsCorrectSignature() throws Exception {
        assertThat(gateway.verifyWebhookSignature(BODY, expectedSignature(SECRET, BODY))).isTrue();
    }

    @Test
    void rejectsTamperedBodyWrongSecretAndGarbage() throws Exception {
        String sig = expectedSignature(SECRET, BODY);
        assertThat(gateway.verifyWebhookSignature(BODY.replace("50000", "1"), sig)).isFalse();
        assertThat(gateway.verifyWebhookSignature(BODY, expectedSignature("other-secret", BODY))).isFalse();
        assertThat(gateway.verifyWebhookSignature(BODY, "not-hex")).isFalse();
        assertThat(gateway.verifyWebhookSignature(BODY, "")).isFalse();
        assertThat(gateway.verifyWebhookSignature(BODY, null)).isFalse();
    }

    @Test
    void blankSecretRejectsEverything() throws Exception {
        RazorpayGateway noSecret = new RazorpayGateway("", "", "");
        assertThat(noSecret.verifyWebhookSignature(BODY, expectedSignature(SECRET, BODY))).isFalse();
        assertThat(noSecret.verifyWebhookSignature(BODY, "")).isFalse();
    }

    @Test
    void matchesRfc4231TestVector2() {
        // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?"
        assertThat(WebhookSignatures.hmacSha256Hex("Jefe", "what do ya want for nothing?"))
                .isEqualTo("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    }

    @Test
    void apiCallsArePendingMerchantApproval() {
        PaymentRequest req = new PaymentRequest(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 100, "k");
        assertThatThrownBy(() -> gateway.createPayment(req))
                .isInstanceOf(UnsupportedOperationException.class).hasMessage("pending merchant approval");
        assertThatThrownBy(() -> gateway.refund(new RefundRequest(UUID.randomUUID(), UUID.randomUUID(), "pay_1", 100, "k")))
                .isInstanceOf(UnsupportedOperationException.class).hasMessage("pending merchant approval");
    }
}
