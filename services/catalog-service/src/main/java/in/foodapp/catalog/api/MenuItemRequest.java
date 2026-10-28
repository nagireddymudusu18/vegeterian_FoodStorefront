package in.foodapp.catalog.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record MenuItemRequest(
        @NotBlank String name,
        String description,
        @NotNull @Min(0) Long pricePaise,
        @JsonProperty("isPureVeg") Boolean isPureVeg,
        @JsonProperty("isVegan") Boolean isVegan,
        @JsonProperty("isJain") Boolean isJain,
        List<String> containsAllergens,
        List<String> ingredients,
        Boolean available) {
}
