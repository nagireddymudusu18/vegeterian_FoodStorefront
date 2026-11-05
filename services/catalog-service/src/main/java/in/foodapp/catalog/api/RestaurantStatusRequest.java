package in.foodapp.catalog.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Store operational status patch (open/paused and optional delivery radius in metres). */
public record RestaurantStatusRequest(
        @NotNull Boolean open,
        @Min(500) @Max(50000) Integer deliveryRadiusMeters
) {
}
