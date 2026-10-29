package in.foodapp.order.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.order.AbstractIntegrationTest;
import in.foodapp.order.api.CreateOrderRequest;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.persistence.Order;
import in.foodapp.order.persistence.OrderEvent;
import in.foodapp.order.persistence.OrderEventRepository;
import in.foodapp.order.persistence.OrderRepository;
import in.foodapp.order.service.OrderService;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Feeds parsed event objects straight into the handler (no HTTP). */
class PaymentEventHandlerIntegrationTest extends AbstractIntegrationTest {

    private static final AtomicLong EVENT_IDS = new AtomicLong(1000);

    @Autowired
    PaymentEventHandler handler;
    @Autowired
    OrderService orderService;
    @Autowired
    OrderRepository orders;
    @Autowired
    OrderEventRepository orderEvents;

    private UUID customer;
    private UUID restaurant;
    private UUID item;

    @BeforeEach
    void seed() {
        customer = UUID.randomUUID();
        restaurant = seedRestaurant(true);
        item = seedItem(restaurant, 10000, true); // total = 20000 + 1000 + 3000 = 24000 for qty 2
    }

    private UUID newOrder() {
        var req = new CreateOrderRequest(restaurant, List.of(new CreateOrderRequest.Line(item, 2)));
        UUID id = orderService.create(customer, null, req).order().id();
        assertThat(orders.findById(id).orElseThrow().getTotalPaise()).isEqualTo(24000);
        return id;
    }

    private FeedEvent event(String type, UUID orderId, Map<String, Object> extra) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>(extra);
        payload.put("orderId", orderId.toString());
        JsonNode node = om.valueToTree(payload);
        return new FeedEvent(EVENT_IDS.incrementAndGet(), type, orderId, Instant.now(), node);
    }

    private FeedEvent captured(UUID orderId, long amount) {
        return event("PaymentCaptured", orderId,
                Map.of("paymentId", UUID.randomUUID().toString(), "amountPaise", amount, "gatewayRef", "fake_1"));
    }

    private OrderStatus status(UUID id) {
        return orders.findById(id).orElseThrow().getStatus();
    }

    private long outboxStatusEvents(UUID id) {
        Long n = jdbc.queryForObject(
                "SELECT count(*) FROM outbox WHERE aggregate_id=?::uuid AND type='OrderStatusChanged'",
                Long.class, id.toString());
        return n == null ? 0 : n;
    }

    @Test
    void captureWithMatchingAmountMovesCreatedToPaid() {
        UUID id = newOrder();
        handler.handle(captured(id, 24000));
        Order o = orders.findById(id).orElseThrow();
        assertThat(o.getStatus()).isEqualTo(OrderStatus.PAID);
        assertThat(o.isWasPaid()).isTrue();
        assertThat(outboxStatusEvents(id)).isEqualTo(1);
        assertThat(orderEvents.findByOrderIdOrderByIdAsc(id))
                .extracting(OrderEvent::getToStatus)
                .containsExactly(OrderStatus.CREATED, OrderStatus.PAID);
    }

    @Test
    void captureIsIdempotent() {
        UUID id = newOrder();
        handler.handle(captured(id, 24000));
        handler.handle(captured(id, 24000));
        assertThat(status(id)).isEqualTo(OrderStatus.PAID);
        assertThat(outboxStatusEvents(id)).isEqualTo(1);
        assertThat(orderEvents.findByOrderIdOrderByIdAsc(id)).hasSize(2);
    }

    @Test
    void amountMismatchLeavesCreatedAndRecordsEvent() {
        UUID id = newOrder();
        handler.handle(captured(id, 23999));
        assertThat(status(id)).isEqualTo(OrderStatus.CREATED);
        assertThat(orderEvents.findByOrderIdOrderByIdAsc(id))
                .extracting(OrderEvent::getReason)
                .contains("AMOUNT_MISMATCH");
        assertThat(outboxStatusEvents(id)).isZero();
    }

    @Test
    void paymentFailedMovesCreatedToPaymentFailed_andLaterCaptureIsIgnored() {
        UUID id = newOrder();
        handler.handle(event("PaymentFailed", id, Map.of("paymentId", UUID.randomUUID().toString(),
                "reason", "card_declined")));
        assertThat(status(id)).isEqualTo(OrderStatus.PAYMENT_FAILED);
        handler.handle(captured(id, 24000));
        assertThat(status(id)).isEqualTo(OrderStatus.PAYMENT_FAILED);
    }

    @Test
    void refundMovesPaidThenCancelledOrderToRefunded() {
        UUID id = newOrder();
        handler.handle(captured(id, 24000));
        orderService.cancel(id, customer);
        assertThat(status(id)).isEqualTo(OrderStatus.CANCELLED);

        FeedEvent refund = event("RefundIssued", id, Map.of("refundId", UUID.randomUUID().toString(),
                "paymentId", UUID.randomUUID().toString(), "amountPaise", 24000));
        handler.handle(refund);
        assertThat(status(id)).isEqualTo(OrderStatus.REFUNDED);
        handler.handle(refund); // replay is a no-op
        assertThat(status(id)).isEqualTo(OrderStatus.REFUNDED);
    }

    @Test
    void refundForNeverPaidCancelledOrderIsIgnored() {
        UUID id = newOrder();
        orderService.cancel(id, customer);
        handler.handle(event("RefundIssued", id, Map.of("refundId", UUID.randomUUID().toString(),
                "paymentId", UUID.randomUUID().toString(), "amountPaise", 24000)));
        assertThat(status(id)).isEqualTo(OrderStatus.CANCELLED);
    }

    @Test
    void refundMovesRejectedByMerchantToRefunded() {
        UUID id = newOrder();
        handler.handle(captured(id, 24000));
        orderService.staffTransition(id, in.foodapp.order.service.StaffCaller.admin(UUID.randomUUID()),
                OrderStatus.REJECTED_BY_MERCHANT, "out of stock");
        handler.handle(event("RefundIssued", id, Map.of("refundId", UUID.randomUUID().toString(),
                "paymentId", UUID.randomUUID().toString(), "amountPaise", 24000)));
        assertThat(status(id)).isEqualTo(OrderStatus.REFUNDED);
    }

    @Test
    void unknownEventTypesAndUnknownOrdersAreIgnored() {
        UUID id = newOrder();
        handler.handle(event("SomethingElse", id, Map.of()));
        handler.handle(captured(UUID.randomUUID(), 1));
        assertThat(status(id)).isEqualTo(OrderStatus.CREATED);
    }

    @Test
    void aMalformedEventThrowsSoThePollerCanParkIt() {
        UUID id = newOrder();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> handler.handle(new FeedEvent(
                        EVENT_IDS.incrementAndGet(), "PaymentCaptured", id, Instant.now(), om.createObjectNode())))
                .isInstanceOf(MalformedEventException.class);
    }
}
