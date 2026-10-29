package in.foodapp.order.events.consumer;

import static in.foodapp.order.events.consumer.MalformedEventException.number;
import static in.foodapp.order.events.consumer.MalformedEventException.uuid;

import com.fasterxml.jackson.databind.JsonNode;
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

/** Applies payment-service events to orders. Idempotent: events for orders already past that state are ignored. */
@Component
public class PaymentEventHandler {

    public static final String AMOUNT_MISMATCH = "AMOUNT_MISMATCH";

    private static final Logger log = LoggerFactory.getLogger(PaymentEventHandler.class);

    private final OrderRepository orders;
    private final OrderTransitionService transitions;

    public PaymentEventHandler(OrderRepository orders, OrderTransitionService transitions) {
        this.orders = orders;
        this.transitions = transitions;
    }

    /** A malformed payload throws {@link MalformedEventException}; the poller parks the event in feed_dead_letter. */
    @Transactional
    public void handle(FeedEvent event) {
        if (event.type() == null) {
            return;
        }
        switch (event.type()) {
            case "PaymentCaptured" -> onCaptured(event);
            case "PaymentFailed" -> onFailed(event);
            case "RefundIssued" -> onRefund(event);
            default -> log.debug("Ignoring payment event type {}", event.type());
        }
    }

    private void onCaptured(FeedEvent event) {
        JsonNode p = event.payload();
        UUID orderId = uuid(p, "orderId");
        long amount = number(p, "amountPaise");
        Order order = orders.findById(orderId).orElse(null);
        if (order == null) {
            log.warn("PaymentCaptured for unknown order {}", orderId);
            return;
        }
        if (order.getStatus() != OrderStatus.CREATED) {
            log.debug("PaymentCaptured for order {} in status {}: ignored", orderId, order.getStatus());
            return;
        }
        if (amount != order.getTotalPaise()) {
            log.warn("Amount mismatch for order {}: paid {} expected {}", orderId, amount,
                    order.getTotalPaise());
            transitions.note(order, AMOUNT_MISMATCH);
            return;
        }
        transitions.transition(order, OrderStatus.PAID, "PAYMENT_CAPTURED");
    }

    private void onFailed(FeedEvent event) {
        UUID orderId = uuid(event.payload(), "orderId");
        Order order = orders.findById(orderId).orElse(null);
        if (order == null || order.getStatus() != OrderStatus.CREATED) {
            return;
        }
        transitions.transition(order, OrderStatus.PAYMENT_FAILED, "PAYMENT_FAILED");
    }

    private void onRefund(FeedEvent event) {
        UUID orderId = uuid(event.payload(), "orderId");
        Order order = orders.findById(orderId).orElse(null);
        if (order == null) {
            return;
        }
        boolean refundable = (order.getStatus() == OrderStatus.CANCELLED
                || order.getStatus() == OrderStatus.REJECTED_BY_MERCHANT) && order.isWasPaid();
        if (!refundable) {
            log.debug("RefundIssued for order {} in status {}: ignored", orderId, order.getStatus());
            return;
        }
        transitions.transition(order, OrderStatus.REFUNDED, "REFUND_ISSUED");
    }
}
