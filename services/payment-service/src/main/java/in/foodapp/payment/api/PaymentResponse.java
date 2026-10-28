package in.foodapp.payment.api;

import in.foodapp.payment.persistence.Payment;

import java.time.Instant;
import java.util.UUID;

public record PaymentResponse(UUID id, UUID orderId, UUID customerId, long amountPaise, String currency,
                              String status, String gateway, String gatewayRef, String failureReason,
                              Instant createdAt, Instant updatedAt) {

    public static PaymentResponse from(Payment p) {
        return new PaymentResponse(p.getId(), p.getOrderId(), p.getCustomerId(), p.getAmountPaise(), p.getCurrency(),
                p.getStatus().name(), p.getGateway(), p.getGatewayRef(), p.getFailureReason(),
                p.getCreatedAt(), p.getUpdatedAt());
    }
}
