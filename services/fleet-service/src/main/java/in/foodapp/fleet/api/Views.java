package in.foodapp.fleet.api;

import java.time.Instant;
import java.util.UUID;

public final class Views {

    private Views() {
    }

    public record PartnerView(UUID userId, String name, String vehicle, boolean online, int activeDeliveries) {
    }

    public record DeliveryView(UUID orderId, String orderNumber, String restaurantName, String status,
                               UUID partnerId, Instant createdAt, Instant updatedAt) {
    }
}