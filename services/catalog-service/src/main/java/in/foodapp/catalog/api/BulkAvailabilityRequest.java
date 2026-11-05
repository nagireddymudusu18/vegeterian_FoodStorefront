package in.foodapp.catalog.api;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record BulkAvailabilityRequest(
        @NotEmpty @Size(max = 100) List<UUID> itemIds,
        @NotNull Boolean available
) {
}
