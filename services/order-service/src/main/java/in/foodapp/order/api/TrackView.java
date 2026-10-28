package in.foodapp.order.api;

import in.foodapp.order.domain.OrderNumbers;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.persistence.Order;
import in.foodapp.order.persistence.OrderEvent;
import java.time.Instant;
import java.util.List;

/**
 * Public, unauthenticated view of an order, looked up by its unguessable order number. Deliberately omits the
 * customer id, order UUID, delivery OTP, addresses and any rejection reason.
 */
public record TrackView(
        String orderNumber,
        String restaurantName,
        OrderStatus status,
        long totalPaise,
        List<Line> items,
        List<Step> timeline,
        Instant createdAt,
        Instant updatedAt) {

    public record Line(String name, int quantity) {
    }

    public record Step(OrderStatus status, Instant at) {
    }

    /** Must be called inside a transaction (or with items already fetched). */
    public static TrackView from(Order o, String restaurantName, List<OrderEvent> events) {
        return new TrackView(OrderNumbers.display(o.getOrderNumber()), restaurantName, o.getStatus(),
                o.getTotalPaise(),
                o.getItems().stream().map(i -> new Line(i.getName(), i.getQuantity())).toList(),
                events.stream().map(e -> new Step(e.getToStatus(), e.getAt())).toList(),
                o.getCreatedAt(), o.getUpdatedAt());
    }
}
