package in.foodapp.order.service;

import in.foodapp.order.domain.OrderStateMachine;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.events.outbox.OutboxService;
import in.foodapp.order.persistence.Order;
import in.foodapp.order.persistence.OrderEvent;
import in.foodapp.order.persistence.OrderEventRepository;
import in.foodapp.order.persistence.OrderRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import in.foodapp.order.domain.OrderNumbers;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only place that changes an order's status. Every transition validates against the state machine, writes an
 * order_events row and an OrderStatusChanged outbox event in the caller's transaction.
 */
@Service
public class OrderTransitionService {

    private final OrderRepository orders;
    private final OrderEventRepository events;
    private final OutboxService outbox;
    private final ApplicationEventPublisher publisher;
    private final RestaurantReplicaRepository restaurants;

    public OrderTransitionService(OrderRepository orders, OrderEventRepository events, OutboxService outbox,
                                  ApplicationEventPublisher publisher, RestaurantReplicaRepository restaurants) {
        this.orders = orders;
        this.events = events;
        this.outbox = outbox;
        this.publisher = publisher;
        this.restaurants = restaurants;
    }

    @Transactional
    public void transition(Order order, OrderStatus to, String reason) {
        OrderStatus from = order.getStatus();
        OrderStateMachine.validate(from, to, order.isWasPaid());
        Instant now = Instant.now();
        order.setStatus(to);
        if (to == OrderStatus.PAID) {
            order.setWasPaid(true);
        }
        order.setUpdatedAt(now);
        orders.save(order);
        events.save(new OrderEvent(order.getId(), from, to, reason, now));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", order.getId().toString());
        payload.put("customerId", order.getCustomerId().toString());
        payload.put("restaurantId", order.getRestaurantId().toString());
        payload.put("from", from.name());
        payload.put("to", to.name());
        payload.put("totalPaise", order.getTotalPaise());
        payload.put("orderNumber", OrderNumbers.display(order.getOrderNumber()));
        restaurants.findById(order.getRestaurantId()).map(RestaurantReplica::getName)
                .ifPresent(n -> payload.put("restaurantName", n));
        outbox.append("OrderStatusChanged", order.getId(), payload);
        publisher.publishEvent(new OrderStatusChangedEvent(order.getId(), to));
    }

    /** Records a non-transition note (e.g. AMOUNT_MISMATCH) without changing status. */
    @Transactional
    public void note(Order order, String reason) {
        events.save(new OrderEvent(order.getId(), order.getStatus(), order.getStatus(), reason, Instant.now()));
    }
}
