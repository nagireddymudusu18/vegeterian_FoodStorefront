package in.foodapp.catalog.api;

import in.foodapp.catalog.domain.KitchenCertificationLevel;
import in.foodapp.catalog.persistence.Restaurant;
import java.util.List;
import java.util.UUID;

/** distanceMeters is set only on search results; menu only on the detail endpoint (nulls are omitted). */
public record RestaurantView(
        UUID id,
        String name,
        String fssaiNumber,
        KitchenCertificationLevel kitchenCertificationLevel,
        double lat,
        double lng,
        int deliveryRadiusMeters,
        boolean open,
        UUID ownerUserId,
        String cuisine,
        Double distanceMeters,
        List<MenuItemView> menu) {

    public static RestaurantView of(Restaurant r, List<MenuItemView> menu) {
        return new RestaurantView(r.getId(), r.getName(), r.getFssaiNumber(), r.getKitchenCertificationLevel(),
                r.getLat(), r.getLng(), r.getDeliveryRadiusMeters(), r.isOpen(), r.getOwnerUserId(), r.getCuisine(),
                null, menu);
    }
}
