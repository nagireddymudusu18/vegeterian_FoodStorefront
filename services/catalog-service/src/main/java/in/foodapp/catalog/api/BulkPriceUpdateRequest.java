package in.foodapp.catalog.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record BulkPriceUpdateRequest(
        @NotEmpty @Size(max = 100) List<@Valid ItemPricePatch> updates
) {
    public record ItemPricePatch(
            @NotNull UUID itemId,
            @Min(0) int pricePaise
    ) {
    }
}
