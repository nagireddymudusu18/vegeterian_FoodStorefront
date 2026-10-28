package in.foodapp.payment.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

/** Body of POST /payments. Money is paise; max 50,000 INR per payment. */
public record CreatePaymentRequest(
        @NotNull UUID orderId,
        @NotNull @Positive @Max(5_000_000L) Long amountPaise) {
}
