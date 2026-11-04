package in.foodapp.order.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.foodapp.order.AbstractIntegrationTest;
import in.foodapp.order.api.CreateOrderRequest;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.events.consumer.CatalogEventHandler;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.events.consumer.FleetEventHandler;
import in.foodapp.order.events.consumer.PaymentEventHandler;
import in.foodapp.order.persistence.MenuItemReplica;
import in.foodapp.order.persistence.OrderRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.service.OrderService;
import in.foodapp.order.service.StaffCaller;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Consumer side of the event contracts in contracts/events: the golden example of every event this service
 * consumes goes through the real handler, and its effect is checked. If a contract changes in a way this
 * service cannot handle, one of these tests fails. Each test asserts the outcome (a replica row, an order status),
 * not just the absence of an exception.
 */
class ConsumerContractIntegrationTest extends AbstractIntegrationTest {

    private static final String ME = "order-service";
    private static final AtomicLong EVENT_IDS = new AtomicLong(5_000_000);

    @Autowired
    CatalogEventHandler catalog;
    @Autowired
    PaymentEventHandler payments;
    @Autowired
    FleetEventHandler fleet;
    @Autowired
    OrderService orderService;
    @Autowired
    OrderRepository orders;

    /** Wraps a payload as the feed would deliver it, after checking the contract promises it to this service. */
    private FeedEvent delivered(String type, UUID aggregate, ObjectNode payload) {
        ContractSchemas.assertValid(type, payload);
        assertThat(ContractSchemas.contract(type).get("x-consumers").toString())
                .as("%s should list %s as a consumer", type, ME).contains(ME);
        return new FeedEvent(EVENT_IDS.incrementAndGet(), type, aggregate, Instant.now(), payload);
    }

    private UUID newOrder(UUID customer) {
        UUID restaurant = seedRestaurant(true);
        UUID item = seedItem(restaurant, 10000, true); // 2 x 10000 + 1000 tax + 3000 delivery = 24000
        var req = new CreateOrderRequest(restaurant, List.of(new CreateOrderRequest.Line(item, 2)));
        return orderService.create(customer, null, req).order().id();
    }

    private OrderStatus status(UUID id) {
        return orders.findById(id).orElseThrow().getStatus();
    }

    private ObjectNode captured(UUID orderId, long amount) {
        ObjectNode p = ContractSchemas.example("PaymentCaptured");
        p.put("orderId", orderId.toString());
        p.put("amountPaise", amount);
        return p;
    }

    @Test
    void restaurantUpsertedIsReplicatedIncludingTheOwner() {
        UUID id = UUID.randomUUID();
        ObjectNode p = ContractSchemas.example("RestaurantUpserted");
        p.put("restaurantId", id.toString());
        p.put("name", "Contract Kitchen");
        catalog.handle(delivered("RestaurantUpserted", id, p));

        RestaurantReplica r = restaurants.findById(id).orElseThrow();
        assertThat(r.getName()).isEqualTo("Contract Kitchen");
        assertThat(r.isOpen()).isEqualTo(p.get("open").asBoolean());
        assertThat(r.getOwnerUserId()).isEqualTo(UUID.fromString(p.get("ownerUserId").asText()));

        p.putNull("ownerUserId");
        catalog.handle(delivered("RestaurantUpserted", id, p));
        assertThat(restaurants.findById(id).orElseThrow().getOwnerUserId()).isNull();
    }

    @Test
    void menuItemEventsAreReplicated() {
        UUID restaurant = UUID.randomUUID();
        UUID item = UUID.randomUUID();
        ObjectNode up = ContractSchemas.example("MenuItemUpserted");
        up.put("itemId", item.toString());
        up.put("restaurantId", restaurant.toString());
        up.put("available", true);
        catalog.handle(delivered("MenuItemUpserted", item, up));

        MenuItemReplica m = items.findById(item).orElseThrow();
        assertThat(m.getName()).isEqualTo(up.get("name").asText());
        assertThat(m.getPricePaise()).isEqualTo(up.get("pricePaise").asLong());
        assertThat(m.isAvailable()).isTrue();

        ObjectNode flip = ContractSchemas.example("MenuItemAvailabilityChanged");
        flip.put("itemId", item.toString());
        flip.put("restaurantId", restaurant.toString());
        flip.put("available", false);
        catalog.handle(delivered("MenuItemAvailabilityChanged", item, flip));
        assertThat(items.findById(item).orElseThrow().isAvailable()).isFalse();
    }

    @Test
    void paymentCapturedMovesAMatchingOrderToPaid() {
        UUID id = newOrder(UUID.randomUUID());
        payments.handle(delivered("PaymentCaptured", id, captured(id, 24000)));
        assertThat(status(id)).isEqualTo(OrderStatus.PAID);
    }

    @Test
    void paymentFailedMovesAnUnpaidOrderToPaymentFailed() {
        UUID id = newOrder(UUID.randomUUID());
        ObjectNode p = ContractSchemas.example("PaymentFailed");
        p.put("orderId", id.toString());
        payments.handle(delivered("PaymentFailed", id, p));
        assertThat(status(id)).isEqualTo(OrderStatus.PAYMENT_FAILED);
    }

    @Test
    void refundIssuedMovesAPaidThenCancelledOrderToRefunded() {
        UUID customer = UUID.randomUUID();
        UUID id = newOrder(customer);
        payments.handle(delivered("PaymentCaptured", id, captured(id, 24000)));
        orderService.cancel(id, customer);
        ObjectNode p = ContractSchemas.example("RefundIssued");
        p.put("orderId", id.toString());
        payments.handle(delivered("RefundIssued", id, p));
        assertThat(status(id)).isEqualTo(OrderStatus.REFUNDED);
    }

    @Test
    void deliveryAssignedMovesAPreparingOrderToRiderAssigned() {
        UUID id = newOrder(UUID.randomUUID());
        payments.handle(delivered("PaymentCaptured", id, captured(id, 24000)));
        StaffCaller admin = StaffCaller.admin(UUID.randomUUID());
        orderService.staffTransition(id, admin, OrderStatus.MERCHANT_ACCEPTED, "ok");
        orderService.staffTransition(id, admin, OrderStatus.PREPARING, "ok");

        ObjectNode p = ContractSchemas.example("DeliveryAssigned");
        p.put("orderId", id.toString());
        fleet.handle(delivered("DeliveryAssigned", id, p));

        assertThat(status(id)).isEqualTo(OrderStatus.RIDER_ASSIGNED);
        assertThat(orders.findById(id).orElseThrow().getRiderUserId())
                .isEqualTo(UUID.fromString(p.get("partnerId").asText()));
    }
}
