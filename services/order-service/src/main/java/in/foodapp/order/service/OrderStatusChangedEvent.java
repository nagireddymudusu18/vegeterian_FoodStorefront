package in.foodapp.order.service;

import in.foodapp.order.domain.OrderStatus;
import java.util.UUID;

/**
 * Published inside the transition transaction; listeners should act only after commit. {@code ownerUserId} is the
 * replicated owner of the restaurant (null when unknown) so staff screens can be notified without a lookup.
 */
public record OrderStatusChangedEvent(UUID orderId, OrderStatus status, UUID ownerUserId) {

    public OrderStatusChangedEvent(UUID orderId, OrderStatus status) {
        this(orderId, status, null);
    }
}