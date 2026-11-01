package in.foodapp.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.foodapp.notification.contract.ContractSchemas;
import in.foodapp.notification.events.consumer.EventHandlers;
import in.foodapp.notification.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.notification.events.consumer.MalformedEventException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Consumer side of every contract this service reads: the golden example from contracts/events goes through the
 * real handlers inside a transaction (as the poller does) and the outcome in the database is checked.
 */
@SpringBootTest
@Import(RecordingSenders.class)
class ConsumerContractTest {

    static final TestDatabase.Conn DB = TestDatabase.start("notification");
    private static final AtomicLong EVENT_IDS = new AtomicLong(1_000);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.contact-event-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
        r.add("app.feed.identity-key", () -> "");
        r.add("app.feed.catalog-key", () -> "");
        r.add("app.feed.order-key", () -> "");
        r.add("app.feed.payment-key", () -> "");
        r.add("app.feed.fleet-key", () -> "");
        r.add("NOTIFY_DISPATCH_MS", () -> "3600000");
    }

    @Autowired
    EventHandlers handlers;
    @Autowired
    TransactionTemplate tx;
    @Autowired
    JdbcTemplate jdbc;

    private static FeedEvent event(String type, ObjectNode payload, Instant at) {
        ContractSchemas.assertValid(type, payload);
        assertThat(ContractSchemas.consumedBy(type, "notification-service"))
                .as(type + " lists notification-service as a consumer").isTrue();
        return new FeedEvent(EVENT_IDS.incrementAndGet(), type, UUID.randomUUID(), at, payload);
    }

    private static FeedEvent event(String type, ObjectNode payload) {
        return event(type, payload, Instant.now());
    }

    private void apply(String source, FeedEvent e) {
        tx.executeWithoutResult(s -> {
            switch (source) {
                case "identity" -> handlers.identity(e);
                case "catalog" -> handlers.catalog(e);
                case "order" -> handlers.order(e);
                case "payment" -> handlers.payment(e);
                case "fleet" -> handlers.fleet(e);
                default -> throw new IllegalArgumentException(source);
            }
        });
    }

    private ObjectNode status(UUID order, UUID customer, UUID restaurant, String to) {
        ObjectNode p = ContractSchemas.example("OrderStatusChanged");
        p.put("orderId", order.toString());
        p.put("customerId", customer.toString());
        p.put("restaurantId", restaurant.toString());
        p.put("to", to);
        return p;
    }

    private ObjectNode restaurant(UUID restaurant, UUID owner) {
        ObjectNode p = ContractSchemas.example("RestaurantUpserted");
        p.put("restaurantId", restaurant.toString());
        if (owner == null) {
            p.putNull("ownerUserId");
        } else {
            p.put("ownerUserId", owner.toString());
        }
        return p;
    }

    private List<Map<String, Object>> inbox(UUID user) {
        return jdbc.queryForList("SELECT kind, title, body, order_id FROM notification WHERE user_id = ? "
                + "ORDER BY created_at, kind", user);
    }

    private List<String> kinds(UUID user) {
        return inbox(user).stream().map(r -> (String) r.get("kind")).toList();
    }

    private List<String> channels(UUID user, String kind) {
        return jdbc.queryForList("SELECT d.channel FROM delivery d JOIN notification n ON n.id = d.notification_id "
                + "WHERE n.user_id = ? AND n.kind = ? ORDER BY d.channel", String.class, user, kind);
    }

    @Test
    void userContactUpdatedStoresTheCiphertextAndMergesFields() {
        UUID user = UUID.randomUUID();
        ObjectNode phone = ContractSchemas.example("UserContactUpdated");
        phone.put("userId", user.toString());
        apply("identity", event("UserContactUpdated", phone));

        Map<String, Object> row = jdbc.queryForMap("SELECT phone_enc, email_enc FROM user_contact WHERE user_id = ?", user);
        assertThat(row.get("phone_enc")).isEqualTo(phone.get("phoneEnc").asText());
        assertThat(row.get("email_enc")).isNull();

        ObjectNode email = phone.deepCopy();
        email.remove("phoneEnc");
        email.put("emailEnc", "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=");
        apply("identity", event("UserContactUpdated", email));

        row = jdbc.queryForMap("SELECT phone_enc, email_enc FROM user_contact WHERE user_id = ?", user);
        assertThat(row.get("phone_enc")).isEqualTo(phone.get("phoneEnc").asText());
        assertThat(row.get("email_enc")).isEqualTo("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=");
    }

    @Test
    void aContactEventWithNoContactIsMalformed() {
        ObjectNode bad = ContractSchemas.example("UserContactUpdated");
        bad.remove("phoneEnc");
        assertThatThrownBy(() -> handlers.identity(new FeedEvent(1, "UserContactUpdated", UUID.randomUUID(),
                Instant.now(), bad))).isInstanceOf(MalformedEventException.class);
    }

    @Test
    void userDeletedErasesContactsAndInbox() {
        UUID user = UUID.randomUUID();
        ObjectNode phone = ContractSchemas.example("UserContactUpdated");
        phone.put("userId", user.toString());
        apply("identity", event("UserContactUpdated", phone));
        UUID order = UUID.randomUUID();
        ObjectNode created = ContractSchemas.example("OrderCreated");
        created.put("orderId", order.toString());
        created.put("customerId", user.toString());
        apply("order", event("OrderCreated", created));
        assertThat(kinds(user)).containsExactly("ORDER_PLACED");

        ObjectNode deleted = ContractSchemas.example("UserDeleted");
        deleted.put("userId", user.toString());
        apply("identity", event("UserDeleted", deleted));

        assertThat(kinds(user)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_contact WHERE user_id = ?", Integer.class, user))
                .isZero();
    }

    @Test
    void restaurantUpsertedRecordsTheOwner() {
        UUID restaurant = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        apply("catalog", event("RestaurantUpserted", restaurant(restaurant, owner)));
        assertThat(jdbc.queryForObject("SELECT owner_user_id FROM restaurant_owner WHERE restaurant_id = ?",
                UUID.class, restaurant)).isEqualTo(owner);
    }

    @Test
    void orderCreatedTellsTheCustomerAndRemembersTheOrder() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        ObjectNode p = ContractSchemas.example("OrderCreated");
        p.put("orderId", order.toString());
        p.put("customerId", customer.toString());
        apply("order", event("OrderCreated", p));

        assertThat(kinds(customer)).containsExactly("ORDER_PLACED");
        assertThat(inbox(customer).get(0).get("body").toString()).contains("\u20B9720.90")
                .doesNotContain("Complete the payment");
        assertThat(jdbc.queryForObject("SELECT customer_id FROM order_ref WHERE order_id = ?", UUID.class, order))
                .isEqualTo(customer);
    }

    @Test
    void aPaidOrderNotifiesTheCustomerAndTheRestaurantOwner() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID restaurant = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        apply("catalog", event("RestaurantUpserted", restaurant(restaurant, owner)));
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "PAID")));

        assertThat(kinds(customer)).containsExactly("ORDER_PAID");
        assertThat(channels(customer, "ORDER_PAID")).containsExactly("EMAIL");
        assertThat(kinds(owner)).containsExactly("NEW_ORDER");
        assertThat(inbox(owner).get(0).get("title").toString()).contains("FA-ABCDE-12345");
    }

    @Test
    void aPaidOrderForARestaurantWithoutAnOwnerOnlyNotifiesTheCustomer() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID restaurant = UUID.randomUUID();
        apply("catalog", event("RestaurantUpserted", restaurant(restaurant, null)));
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "PAID")));
        assertThat(kinds(customer)).containsExactly("ORDER_PAID");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE order_id = ? AND kind = 'NEW_ORDER'",
                Integer.class, order)).isZero();
    }

    @Test
    void aPaidOrderForAnUnknownRestaurantFailsSoItIsRetriedAndRollsBackCompletely() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        FeedEvent e = event("OrderStatusChanged", status(order, customer, UUID.randomUUID(), "PAID"));
        assertThatThrownBy(() -> apply("order", e)).hasMessageContaining("not known yet");
        assertThat(kinds(customer)).isEmpty();
    }

    @Test
    void preparingBroadcastsAJobToPartnersAndNotToTheCustomerInbox() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        apply("order", event("OrderStatusChanged", status(order, customer, UUID.randomUUID(), "PREPARING")));

        assertThat(jdbc.queryForObject("SELECT body FROM notification WHERE audience = 'PARTNER' AND order_id = ?",
                String.class, order)).contains("Spice Route Kitchen").contains("FA-ABCDE-12345");
        assertThat(kinds(customer)).containsExactly("ORDER_PREPARING");
    }

    @Test
    void theJobBroadcastIsWithdrawnOnceTheJobIsTakenOrTheOrderEnds() {
        UUID restaurant = UUID.randomUUID();
        for (String closing : new String[] {"RIDER_ASSIGNED", "CANCELLED", "REJECTED_BY_MERCHANT", "DELIVERED"}) {
            UUID order = UUID.randomUUID();
            UUID customer = UUID.randomUUID();
            apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "PREPARING")));
            assertThat(jobBroadcasts(order)).as("broadcast before " + closing).isEqualTo(1);

            apply("order", event("OrderStatusChanged", status(order, customer, restaurant, closing)));
            assertThat(jobBroadcasts(order)).as("broadcast after " + closing).isZero();
        }
    }

    @Test
    void anOldClosingEventStillWithdrawsTheJobBroadcast() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID restaurant = UUID.randomUUID();
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "PREPARING")));
        Instant old = Instant.now().minusSeconds(3 * 3600);
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "RIDER_ASSIGNED"), old));
        assertThat(jobBroadcasts(order)).isZero();
    }

    @Test
    void theJobBroadcastIsKeptWhileTheOrderIsOnlyAccepted() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID restaurant = UUID.randomUUID();
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "PREPARING")));
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "MERCHANT_ACCEPTED")));
        assertThat(jobBroadcasts(order)).isEqualTo(1);
    }

    private int jobBroadcasts(UUID order) {
        return jdbc.queryForObject("SELECT count(*) FROM notification WHERE audience = 'PARTNER' AND order_id = ?",
                Integer.class, order);
    }

    @Test
    void deliveredAndOutForDeliveryUseTheirChannels() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID restaurant = UUID.randomUUID();
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "PICKED_UP")));
        apply("order", event("OrderStatusChanged", status(order, customer, restaurant, "DELIVERED")));
        assertThat(channels(customer, "ORDER_OUT_FOR_DELIVERY")).containsExactly("SMS");
        assertThat(channels(customer, "ORDER_DELIVERED")).containsExactly("EMAIL");
    }

    @Test
    void paymentFailedAndRefundReachTheCustomerOfTheOrder() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        ObjectNode created = ContractSchemas.example("OrderCreated");
        created.put("orderId", order.toString());
        created.put("customerId", customer.toString());
        apply("order", event("OrderCreated", created));

        ObjectNode failed = ContractSchemas.example("PaymentFailed");
        failed.put("orderId", order.toString());
        apply("payment", event("PaymentFailed", failed));
        ObjectNode refund = ContractSchemas.example("RefundIssued");
        refund.put("orderId", order.toString());
        apply("payment", event("RefundIssued", refund));

        assertThat(kinds(customer)).containsExactlyInAnyOrder("ORDER_PLACED", "PAYMENT_FAILED", "REFUND_ISSUED");
        assertThat(channels(customer, "REFUND_ISSUED")).containsExactly("EMAIL");
    }

    @Test
    void aPaymentEventForAnOrderNotSeenYetIsRetriedButAStaleOneIsDropped() {
        ObjectNode failed = ContractSchemas.example("PaymentFailed");
        failed.put("orderId", UUID.randomUUID().toString());
        assertThatThrownBy(() -> apply("payment", event("PaymentFailed", failed)))
                .hasMessageContaining("not known yet");

        apply("payment", event("PaymentFailed", failed, Instant.now().minus(5, ChronoUnit.HOURS)));
    }

    @Test
    void deliveryAssignedTellsThePartner() {
        UUID order = UUID.randomUUID();
        UUID partner = UUID.randomUUID();
        ObjectNode p = ContractSchemas.example("DeliveryAssigned");
        p.put("orderId", order.toString());
        p.put("partnerId", partner.toString());
        apply("fleet", event("DeliveryAssigned", p));
        assertThat(kinds(partner)).containsExactly("JOB_ASSIGNED");
    }

    @Test
    void replayingAnEventDoesNotNotifyTwice() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        FeedEvent e = event("OrderStatusChanged", status(order, customer, UUID.randomUUID(), "PICKED_UP"));
        apply("order", e);
        apply("order", e);
        assertThat(kinds(customer)).containsExactly("ORDER_OUT_FOR_DELIVERY");
        assertThat(channels(customer, "ORDER_OUT_FOR_DELIVERY")).containsExactly("SMS");
    }

    @Test
    void staleEventsUpdateReplicasButSendNothing() {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        apply("order", event("OrderStatusChanged", status(order, customer, UUID.randomUUID(), "DELIVERED"),
                Instant.now().minus(3, ChronoUnit.HOURS)));
        assertThat(kinds(customer)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT order_number FROM order_ref WHERE order_id = ?", String.class, order))
                .isEqualTo("FA-ABCDE-12345");
    }

    @Test
    void malformedEventsAreRejectedForParking() {
        ObjectNode p = ContractSchemas.example("OrderStatusChanged");
        p.remove("customerId");
        assertThatThrownBy(() -> handlers.order(new FeedEvent(1, "OrderStatusChanged", UUID.randomUUID(),
                Instant.now(), p))).isInstanceOf(MalformedEventException.class).hasMessageContaining("customerId");
    }

    @Test
    void unrelatedEventTypesAreIgnored() {
        handlers.order(new FeedEvent(1, "SomethingElse", UUID.randomUUID(), Instant.now(),
                ContractSchemas.example("OrderCreated")));
        handlers.identity(new FeedEvent(2, "UserRegistered", UUID.randomUUID(), Instant.now(),
                ContractSchemas.example("UserRegistered")));
    }
}
