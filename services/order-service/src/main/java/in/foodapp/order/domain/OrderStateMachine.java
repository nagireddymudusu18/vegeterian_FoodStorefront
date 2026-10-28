package in.foodapp.order.domain;

import static in.foodapp.order.domain.OrderStatus.CANCELLED;
import static in.foodapp.order.domain.OrderStatus.CREATED;
import static in.foodapp.order.domain.OrderStatus.DELIVERED;
import static in.foodapp.order.domain.OrderStatus.MERCHANT_ACCEPTED;
import static in.foodapp.order.domain.OrderStatus.PAID;
import static in.foodapp.order.domain.OrderStatus.PAYMENT_FAILED;
import static in.foodapp.order.domain.OrderStatus.PICKED_UP;
import static in.foodapp.order.domain.OrderStatus.PREPARING;
import static in.foodapp.order.domain.OrderStatus.REFUNDED;
import static in.foodapp.order.domain.OrderStatus.REJECTED_BY_MERCHANT;
import static in.foodapp.order.domain.OrderStatus.RIDER_ASSIGNED;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

/**
 * The single transition table for orders. Pure Java, no Spring.
 *
 * <pre>
 * CREATED -> PAID | PAYMENT_FAILED | CANCELLED
 * PAID -> MERCHANT_ACCEPTED | REJECTED_BY_MERCHANT | CANCELLED
 * MERCHANT_ACCEPTED -> PREPARING | CANCELLED
 * PREPARING -> RIDER_ASSIGNED | CANCELLED
 * RIDER_ASSIGNED -> PICKED_UP
 * PICKED_UP -> DELIVERED
 * REJECTED_BY_MERCHANT -> REFUNDED
 * CANCELLED -> REFUNDED   (only if the order had been PAID)
 * </pre>
 */
public final class OrderStateMachine {

    private static final Map<OrderStatus, Set<OrderStatus>> ALLOWED = new EnumMap<>(OrderStatus.class);

    static {
        for (OrderStatus s : OrderStatus.values()) {
            ALLOWED.put(s, Set.of());
        }
        ALLOWED.put(CREATED, Set.of(PAID, PAYMENT_FAILED, CANCELLED));
        ALLOWED.put(PAID, Set.of(MERCHANT_ACCEPTED, REJECTED_BY_MERCHANT, CANCELLED));
        ALLOWED.put(MERCHANT_ACCEPTED, Set.of(PREPARING, CANCELLED));
        ALLOWED.put(PREPARING, Set.of(RIDER_ASSIGNED, CANCELLED));
        ALLOWED.put(RIDER_ASSIGNED, Set.of(PICKED_UP));
        ALLOWED.put(PICKED_UP, Set.of(DELIVERED));
        ALLOWED.put(REJECTED_BY_MERCHANT, Set.of(REFUNDED));
        ALLOWED.put(CANCELLED, Set.of(REFUNDED));
    }

    private OrderStateMachine() {
    }

    /** Structural check only (ignores the "was paid" guard on CANCELLED -> REFUNDED). */
    public static boolean isAllowed(OrderStatus from, OrderStatus to) {
        return ALLOWED.get(from).contains(to);
    }

    public static boolean canTransition(OrderStatus from, OrderStatus to, boolean wasPaid) {
        if (!isAllowed(from, to)) {
            return false;
        }
        if (from == CANCELLED && to == REFUNDED) {
            return wasPaid;
        }
        return true;
    }

    public static void validate(OrderStatus from, OrderStatus to, boolean wasPaid) {
        if (!canTransition(from, to, wasPaid)) {
            throw new IllegalTransitionException(from, to);
        }
    }

    public static Set<OrderStatus> allowedFrom(OrderStatus from) {
        return ALLOWED.get(from);
    }
}
