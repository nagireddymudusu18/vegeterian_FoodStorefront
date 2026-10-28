package in.foodapp.payment.infra.gateway;

/**
 * Result of creating a payment at the gateway.
 *
 * @param captured      true when the funds are already captured (fake gateway always captures immediately)
 * @param failed        true when the gateway reported a failure
 * @param gatewayRef    gateway payment/order reference (may be null on failure)
 * @param failureReason human readable reason when failed
 */
public record GatewayPayment(boolean captured, boolean failed, String gatewayRef, String failureReason) {

    public static GatewayPayment capturedWith(String gatewayRef) {
        return new GatewayPayment(true, false, gatewayRef, null);
    }

    public static GatewayPayment failedWith(String gatewayRef, String reason) {
        return new GatewayPayment(false, true, gatewayRef, reason);
    }

    /** Created at the gateway but not yet captured (real gateways: customer still has to pay). */
    public static GatewayPayment pending(String gatewayRef) {
        return new GatewayPayment(false, false, gatewayRef, null);
    }
}
