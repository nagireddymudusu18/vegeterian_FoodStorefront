package in.foodapp.order.api;

import in.foodapp.order.domain.OrderNumbers;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.persistence.Order;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** API representation of an order. {@code deliveryOtp} is null (and omitted) unless explicitly revealed. */
public record OrderView(
        UUID id,
        String orderNumber,
        UUID customerId,
        UUID restaurantId,
        OrderStatus status,
        long subtotalPaise,
        long taxPaise,
        long deliveryFeePaise,
        long totalPaise,
        String deliveryOtp,
        List<ItemView> items,
        Instant createdAt,
        Instant updatedAt) {

    public record ItemView(UUID itemId, String name, long unitPricePaise, int quantity, long lineTotalPaise) {
    }

    /** Must be called inside a transaction (or with items already fetched). */
    public static OrderView from(Order o, boolean revealOtp) {
        String otp = revealOtp && o.getStatus() == OrderStatus.PICKED_UP ? o.getDeliveryOtp() : null;
        List<ItemView> items = o.getItems().stream()
                .map(i -> new ItemView(i.getItemId(), i.getName(), i.getUnitPricePaise(), i.getQuantity(),
                        i.getLineTotalPaise()))
                .toList();
        return new OrderView(o.getId(), OrderNumbers.display(o.getOrderNumber()), o.getCustomerId(), o.getRestaurantId(), o.getStatus(),
                o.getSubtotalPaise(), o.getTaxPaise(), o.getDeliveryFeePaise(), o.getTotalPaise(), otp, items,
                o.getCreatedAt(), o.getUpdatedAt());
    }
}
