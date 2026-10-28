package in.foodapp.order.api;

import in.foodapp.order.domain.OrderNumbers;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.persistence.Order;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** What a restaurant sees of an order: what to cook and its state. No customer identity or delivery OTP. */
public record StaffOrderView(
        UUID id,
        String orderNumber,
        String restaurantName,
        OrderStatus status,
        long totalPaise,
        List<Line> items,
        Instant createdAt,
        Instant updatedAt) {

    public record Line(String name, int quantity) {
    }

    /** Must be called inside a transaction (or with items already fetched). */
    public static StaffOrderView from(Order o, String restaurantName) {
        List<Line> lines = o.getItems().stream().map(i -> new Line(i.getName(), i.getQuantity())).toList();
        return new StaffOrderView(o.getId(), OrderNumbers.display(o.getOrderNumber()), restaurantName, o.getStatus(),
                o.getTotalPaise(), lines, o.getCreatedAt(), o.getUpdatedAt());
    }
}