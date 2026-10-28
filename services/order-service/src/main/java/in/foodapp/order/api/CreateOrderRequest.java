package in.foodapp.order.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

/**
 * Cart only: restaurant + item ids + quantities. There are deliberately NO price/total fields; any such
 * property sent by a client is ignored and prices are recomputed from the local menu replica.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CreateOrderRequest(
        @NotNull UUID restaurantId,
        @NotEmpty @Size(max = 50) List<@Valid @NotNull Line> lines) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Line(
            @NotNull UUID itemId,
            @Min(1) @Max(20) int quantity) {
    }
}
