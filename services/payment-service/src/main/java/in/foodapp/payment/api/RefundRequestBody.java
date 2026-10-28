package in.foodapp.payment.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record RefundRequestBody(@NotNull @Positive Long amountPaise) {
}
