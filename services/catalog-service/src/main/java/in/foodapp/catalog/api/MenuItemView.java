package in.foodapp.catalog.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import in.foodapp.catalog.persistence.MenuItem;
import java.util.List;
import java.util.UUID;

public record MenuItemView(
        UUID id,
        UUID restaurantId,
        String name,
        String description,
        long pricePaise,
        @JsonProperty("isPureVeg") boolean isPureVeg,
        @JsonProperty("isVegan") boolean isVegan,
        @JsonProperty("isJain") boolean isJain,
        List<String> containsAllergens,
        List<String> ingredients,
        boolean available) {

    public static MenuItemView of(MenuItem m) {
        return new MenuItemView(m.getId(), m.getRestaurantId(), m.getName(), m.getDescription(),
                m.getPricePaise(), m.isPureVeg(), m.isVegan(), m.isJain(),
                List.copyOf(m.getContainsAllergens()), List.copyOf(m.getIngredients()), m.isAvailable());
    }
}
