package in.foodapp.payment.infra.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Local-dev gateway (GATEWAY=fake). Captures immediately and returns a fake reference, so it must never
 * run where real money or real orders are involved: it refuses to start unless ALLOW_FAKE_GATEWAY=true,
 * which only the local stack and staging set.
 * Deterministic failure: any payment whose amountPaise ends in 13 (amountPaise % 100 == 13) fails.
 * Webhook signatures use the same HMAC-SHA256 scheme as Razorpay, keyed by RAZORPAY_WEBHOOK_SECRET,
 * so the webhook endpoint can be exercised locally.
 */
@Component
@ConditionalOnProperty(name = "app.gateway", havingValue = "fake", matchIfMissing = true)
public class FakeGateway implements PaymentGateway {

    private final String webhookSecret;

    public FakeGateway(@Value("${app.razorpay.webhook-secret:}") String webhookSecret,
                       @Value("${app.allow-fake-gateway:false}") boolean allowed) {
        if (!allowed) {
            throw new IllegalStateException("GATEWAY=fake marks every payment as paid without charging anyone. "
                    + "Set GATEWAY=razorpay, or ALLOW_FAKE_GATEWAY=true for local development or staging only.");
        }
        this.webhookSecret = webhookSecret;
    }

    @Override
    public String name() {
        return "fake";
    }

    @Override
    public GatewayPayment createPayment(PaymentRequest request) {
        if (request.amountPaise() % 100 == 13) {
            return GatewayPayment.failedWith(null, "Fake gateway: simulated decline (amount ends in 13)");
        }
        return GatewayPayment.capturedWith("fake_pay_" + UUID.randomUUID().toString().replace("-", ""));
    }

    @Override
    public GatewayRefund refund(RefundRequest request) {
        return GatewayRefund.ok("fake_rfnd_" + UUID.randomUUID().toString().replace("-", ""));
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signatureHeader) {
        return WebhookSignatures.verify(webhookSecret, rawBody, signatureHeader);
    }
}
