package in.foodapp.payment.infra.gateway;

import java.util.UUID;

/** Input to {@link PaymentGateway#createPayment}. */
public record PaymentRequest(UUID paymentId, UUID orderId, UUID customerId, long amountPaise, String idempotencyKey) {
}
