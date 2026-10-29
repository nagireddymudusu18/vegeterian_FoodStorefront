package in.foodapp.payment.infra.gateway;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FakeGatewayTest {

    private final FakeGateway gateway = new FakeGateway("secret", true);

    @Test
    void refusesToStartUnlessExplicitlyAllowed() {
        assertThatThrownBy(() -> new FakeGateway("secret", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ALLOW_FAKE_GATEWAY");
    }

    private PaymentRequest req(long amount) {
        return new PaymentRequest(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), amount, "k");
    }

    @Test
    void capturesImmediatelyWithFakeRef() {
        GatewayPayment p = gateway.createPayment(req(45_000));
        assertThat(p.captured()).isTrue();
        assertThat(p.failed()).isFalse();
        assertThat(p.gatewayRef()).startsWith("fake_pay_");
    }

    @Test
    void failsWhenAmountEndsIn13() {
        assertThat(gateway.createPayment(req(1_013)).failed()).isTrue();
        assertThat(gateway.createPayment(req(50_013)).failed()).isTrue();
        assertThat(gateway.createPayment(req(1_031)).failed()).isFalse();
    }

    @Test
    void webhookSignatureUsesHmacWithConfiguredSecret() {
        String body = "{}";
        assertThat(gateway.verifyWebhookSignature(body, WebhookSignatures.hmacSha256Hex("secret", body))).isTrue();
        assertThat(gateway.verifyWebhookSignature(body, "bad")).isFalse();
    }
}
