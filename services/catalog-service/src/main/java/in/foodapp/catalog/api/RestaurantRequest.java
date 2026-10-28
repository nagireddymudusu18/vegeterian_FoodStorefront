package in.foodapp.catalog.api;

import in.foodapp.catalog.domain.KitchenCertificationLevel;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record RestaurantRequest(
        @NotBlank String name,
        @NotBlank String fssaiNumber,
        @NotNull KitchenCertificationLevel kitchenCertificationLevel,
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double lat,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double lng,
        @NotNull @Min(1) Integer deliveryRadiusMeters,
        Boolean open,
        /** Only honoured for ADMIN callers; restaurant owners always own what they create. */
        UUID ownerUserId,
        /** Optional free-text category such as "South Indian"; shown on the storefront home page. */
        @Size(max = 40) String cuisine) {
}
