package in.foodapp.order.api;

import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.domain.OrderNumbers;
import in.foodapp.order.persistence.Order;
import java.util.UUID;

/** What a delivery partner may see of an order: no customer or item details. */
public record RiderOrderView(UUID id, String orderNumber, OrderStatus status) {

    public static RiderOrderView from(Order o) {
        return new RiderOrderView(o.getId(), OrderNumbers.display(o.getOrderNumber()), o.getStatus());
    }
}