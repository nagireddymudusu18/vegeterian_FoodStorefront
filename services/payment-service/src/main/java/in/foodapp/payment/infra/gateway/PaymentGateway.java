package in.foodapp.payment.infra.gateway;

/** Port to the payment gateway. Implementations: {@link FakeGateway}, {@link RazorpayGateway}. */
public interface PaymentGateway {

    /** Short gateway name persisted on the payment row (e.g. "fake", "razorpay"). */
    String name();

    GatewayPayment createPayment(PaymentRequest request);

    GatewayRefund refund(RefundRequest request);

    /**
     * Verifies the webhook signature over the exact raw request body.
     *
     * @param rawBody         the unmodified request body
     * @param signatureHeader value of the signature header (hex HMAC-SHA256 for Razorpay)
     */
    boolean verifyWebhookSignature(String rawBody, String signatureHeader);
}
