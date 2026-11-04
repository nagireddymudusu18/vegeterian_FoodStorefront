package in.foodapp.order.events.consumer;

import static in.foodapp.order.events.consumer.MalformedEventException.uuid;

import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.persistence.Order;
import in.foodapp.order.persistence.OrderRepository;
import in.foodapp.order.service.OrderTransitionService;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Applies fleet-service events. DeliveryAssigned records the rider and moves PREPARING to RIDER_ASSIGNED; it is
 * ignored for any other status (e.g. the order was cancelled meanwhile), which also makes replays harmless.
 */
@Component
public class FleetEventHandler {

    private static final Logger log = LoggerFactory.getLogger(FleetEventHandler.class);

    private final OrderRepository orders;
    private final OrderTransitionService transitions;

    public FleetEventHandler(OrderRepository orders, OrderTransitionService transitions) {
        this.orders = orders;
        this.transitions = transitions;
    }

    /** A malformed payload throws {@link MalformedEventException}; the poller parks the event in feed_dead_letter. */
    @Transactional
    public void handle(FeedEvent event) {
        if (event.type() == null) {
            return;
        }
        if ("DeliveryAssigned".equals(event.type())) {
            onAssigned(event);
        } else {
            log.debug("Ignoring fleet event type {}", event.type());
        }
    }

    private void onAssigned(FeedEvent event) {
        UUID orderId = uuid(event.payload(), "orderId");
        UUID partnerId = uuid(event.payload(), "partnerId");
        Order order = orders.findById(orderId).orElse(null);
        if (order == null || order.getStatus() != OrderStatus.PREPARING) {
            log.debug("DeliveryAssigned for order {} ignored (missing or not PREPARING)", orderId);
            return;
        }
        order.setRiderUserId(partnerId);
        transitions.transition(order, OrderStatus.RIDER_ASSIGNED, "FLEET_ASSIGNED");
    }
}