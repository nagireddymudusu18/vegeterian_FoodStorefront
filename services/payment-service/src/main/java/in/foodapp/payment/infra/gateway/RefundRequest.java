package in.foodapp.payment.infra.gateway;

import java.util.UUID;

public record RefundRequest(UUID refundId, UUID paymentId, String paymentGatewayRef, long amountPaise,
                            String idempotencyKey) {
}
