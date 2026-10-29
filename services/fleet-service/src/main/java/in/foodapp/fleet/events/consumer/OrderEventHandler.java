package in.foodapp.fleet.events.consumer;

import static in.foodapp.fleet.events.consumer.MalformedEventException.optText;
import static in.foodapp.fleet.events.consumer.MalformedEventException.text;
import static in.foodapp.fleet.events.consumer.MalformedEventException.uuid;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.fleet.events.consumer.FeedDtos.FeedEvent;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import in.foodapp.fleet.events.stream.FleetChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors order-service status changes into delivery jobs, so partners and customers always agree:
 * PREPARING opens a job; PICKED_UP / DELIVERED advance it; cancellation or rejection closes it. All updates are
 * conditional, so replays and out-of-order duplicates are harmless.
 */
@Component
public class OrderEventHandler {

    private static final Logger log = LoggerFactory.getLogger(OrderEventHandler.class);

    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public OrderEventHandler(JdbcTemplate jdbc, ApplicationEventPublisher events) {
        this.events = events;
        this.jdbc = jdbc;
    }

    /** A malformed payload throws {@link MalformedEventException}; the poller parks the event in feed_dead_letter. */
    @Transactional
    public void handle(FeedEvent event) {
        if (!"OrderStatusChanged".equals(event.type())) {
            return;
        }
        JsonNode p = event.payload();
        UUID orderId = uuid(p, "orderId");
        String to = text(p, "to");
        switch (to) {
            case "PREPARING" -> open(orderId, p);
            case "RIDER_ASSIGNED" -> closeIfUnclaimed(orderId);
            case "PICKED_UP" -> advance(orderId, "PICKED_UP", "'ASSIGNED'");
            case "DELIVERED" -> advance(orderId, "DELIVERED", "'ASSIGNED', 'PICKED_UP'");
            case "CANCELLED", "REJECTED_BY_MERCHANT", "REFUNDED" ->
                    advance(orderId, "CANCELLED", "'AVAILABLE', 'ASSIGNED'");
            default -> log.debug("Ignoring order status {}", to);
        }
        events.publishEvent(new FleetChangedEvent());
    }

    private void open(UUID orderId, JsonNode p) {
        String number = optText(p, "orderNumber");
        jdbc.update("INSERT INTO deliveries(order_id, order_number, restaurant_id, restaurant_name, status) "
                + "VALUES (?, ?, ?, ?, 'AVAILABLE') ON CONFLICT (order_id) DO NOTHING",
                orderId, number == null ? orderId.toString().substring(0, 8) : number,
                uuid(p, "restaurantId"), optText(p, "restaurantName"));
    }

    /** The restaurant moved the order to RIDER_ASSIGNED without fleet: the job must leave the pool. */
    private void closeIfUnclaimed(UUID orderId) {
        jdbc.update("UPDATE deliveries SET status = 'CANCELLED', updated_at = now() "
                + "WHERE order_id = ? AND status = 'AVAILABLE'", orderId);
    }

    private void advance(UUID orderId, String to, String fromStates) {
        jdbc.update("UPDATE deliveries SET status = ?, updated_at = now() WHERE order_id = ? AND status IN ("
                + fromStates + ")", to, orderId);
    }
}