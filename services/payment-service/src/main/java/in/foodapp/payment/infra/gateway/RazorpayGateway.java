package in.foodapp.payment.infra.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Razorpay gateway stub (GATEWAY=razorpay). Webhook signature verification is real; the API calls are
 * placeholders until the merchant account is approved.
 */
@Component
@ConditionalOnProperty(name = "app.gateway", havingValue = "razorpay")
public class RazorpayGateway implements PaymentGateway {

    private final String keyId;
    private final String keySecret;
    private final String webhookSecret;

    public RazorpayGateway(@Value("${app.razorpay.key-id:}") String keyId,
                           @Value("${app.razorpay.key-secret:}") String keySecret,
                           @Value("${app.razorpay.webhook-secret:}") String webhookSecret) {
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = webhookSecret;
    }

    @Override
    public String name() {
        return "razorpay";
    }

    @Override
    public GatewayPayment createPayment(PaymentRequest request) {
        return createOrder(request);
    }

    @Override
    public GatewayRefund refund(RefundRequest request) {
        return createRefund(request);
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signatureHeader) {
        return WebhookSignatures.verify(webhookSecret, rawBody, signatureHeader);
    }

    // TODO(merchant approval): POST /v1/orders with amount (paise), currency INR, receipt = paymentId.
    private GatewayPayment createOrder(PaymentRequest request) {
        throw new UnsupportedOperationException("pending merchant approval");
    }

    // TODO(merchant approval): verify checkout signature (order_id|payment_id) and capture via /v1/payments/{id}/capture.
    GatewayPayment capturePayment(String razorpayPaymentId, long amountPaise) {
        throw new UnsupportedOperationException("pending merchant approval");
    }

    // TODO(merchant approval): POST /v1/payments/{id}/refund with amount and speed.
    private GatewayRefund createRefund(RefundRequest request) {
        throw new UnsupportedOperationException("pending merchant approval");
    }
}
