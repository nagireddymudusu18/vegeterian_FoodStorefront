package in.foodapp.payment.api;

import in.foodapp.payment.persistence.Refund;

import java.time.Instant;
import java.util.UUID;

public record RefundResponse(UUID refundId, UUID paymentId, long amountPaise, String status, String gatewayRef,
                             Instant createdAt) {

    public static RefundResponse from(Refund r) {
        return new RefundResponse(r.getId(), r.getPaymentId(), r.getAmountPaise(), r.getStatus().name(),
                r.getGatewayRef(), r.getCreatedAt());
    }
}
