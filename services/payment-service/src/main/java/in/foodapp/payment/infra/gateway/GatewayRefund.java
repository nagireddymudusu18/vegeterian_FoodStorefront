package in.foodapp.payment.infra.gateway;

public record GatewayRefund(boolean success, String gatewayRef, String failureReason) {

    public static GatewayRefund ok(String gatewayRef) {
        return new GatewayRefund(true, gatewayRef, null);
    }

    public static GatewayRefund failed(String reason) {
        return new GatewayRefund(false, null, reason);
    }
}
