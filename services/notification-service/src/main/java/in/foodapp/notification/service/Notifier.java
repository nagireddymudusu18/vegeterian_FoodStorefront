package in.foodapp.notification.service;

import in.foodapp.notification.config.AppProperties;
import in.foodapp.notification.domain.Templates;
import in.foodapp.notification.persistence.NotificationStore;
import in.foodapp.notification.persistence.ReplicaStore;
import in.foodapp.notification.persistence.ReplicaStore.OrderRef;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns facts from other services into notifications. Every method runs inside the feed poller's transaction,
 * is idempotent (a dedupe key per message) and raises nothing for stale events: a backlog replayed after an
 * outage, or on first start, must not message customers about orders that finished long ago.
 */
@Service
public class Notifier {

    private static final Logger log = LoggerFactory.getLogger(Notifier.class);

    /** Role name used as the audience of delivery-job broadcasts. */
    public static final String PARTNER = "PARTNER";

    private static final String JOB_KEY_PREFIX = "job:";

    /** Statuses after which the "new delivery job" broadcast is no longer true (taken, or the order ended). */
    private static final java.util.Set<String> JOB_CLOSED = java.util.Set.of("RIDER_ASSIGNED", "PICKED_UP",
            "DELIVERED", "CANCELLED", "REJECTED_BY_MERCHANT", "REFUNDED", "PAYMENT_FAILED");

    private final NotificationStore notifications;
    private final ReplicaStore replicas;
    private final Duration maxEventAge;
    private final Clock clock;

    public Notifier(NotificationStore notifications, ReplicaStore replicas, AppProperties props, Clock clock) {
        this.notifications = notifications;
        this.replicas = replicas;
        this.maxEventAge = Duration.ofMinutes(props.messaging().maxEventAgeMinutes());
        this.clock = clock;
    }

    private boolean fresh(Instant occurredAt) {
        return occurredAt == null || Duration.between(occurredAt, clock.instant()).compareTo(maxEventAge) <= 0;
    }

    public void orderCreated(UUID orderId, UUID customerId, UUID restaurantId, long totalPaise, Instant at) {
        replicas.upsertOrder(orderId, customerId, restaurantId, null, null, totalPaise);
        if (fresh(at)) {
            notifications.createForUser(customerId, Templates.orderPlaced(totalPaise), orderId,
                    "order:" + orderId + ":created");
        }
    }

    /** One status change can reach three audiences: the customer, the restaurant owner and the delivery partners. */
    public void orderStatusChanged(UUID orderId, UUID customerId, UUID restaurantId, String to, long totalPaise,
                                   String orderNumber, String restaurantName, Instant at) {
        replicas.upsertOrder(orderId, customerId, restaurantId, orderNumber, restaurantName, totalPaise);
        // Not conditional on freshness: once the job is taken (or the order ended) the broadcast must go, even when
        // this event is old. The order feed is ordered, so this always runs after the PREPARING event created it.
        if (JOB_CLOSED.contains(to)) {
            notifications.withdraw(JOB_KEY_PREFIX + orderId);
        }
        if (!fresh(at)) {
            return;
        }
        Templates.customerStatus(to, orderNumber, orderId.toString(), restaurantName).ifPresent(m ->
                notifications.createForUser(customerId, m, orderId, "order:" + orderId + ":" + to));
        if ("PAID".equals(to)) {
            alertRestaurant(orderId, restaurantId, orderNumber, totalPaise);
        } else if ("PREPARING".equals(to)) {
            notifications.createForAudience(PARTNER,
                    Templates.newDeliveryJob(orderNumber, orderId.toString(), restaurantName), orderId,
                    JOB_KEY_PREFIX + orderId);
        }
    }

    private void alertRestaurant(UUID orderId, UUID restaurantId, String orderNumber, long totalPaise) {
        // The catalog feed may not have delivered this restaurant yet: fail so the event is retried shortly.
        ReplicaStore.Owner owner = replicas.restaurant(restaurantId).orElseThrow(() ->
                new IllegalStateException("Restaurant " + restaurantId + " is not known yet"));
        if (owner.ownerUserId() == null) {
            log.info("Restaurant {} has no owner account; no new-order alert for order {}", restaurantId, orderId);
            return;
        }
        notifications.createForUser(owner.ownerUserId(),
                Templates.newOrderForRestaurant(orderNumber, orderId.toString(), totalPaise), orderId,
                "order:" + orderId + ":restaurant-alert");
    }

    public void paymentFailed(UUID paymentId, UUID orderId, Instant at) {
        withOrder(orderId, at, "PaymentFailed", order -> notifications.createForUser(order.customerId(),
                Templates.paymentFailed(order.orderNumber(), orderId.toString()), orderId,
                "payment-failed:" + paymentId));
    }

    public void refundIssued(UUID refundId, UUID orderId, long amountPaise, Instant at) {
        withOrder(orderId, at, "RefundIssued", order -> notifications.createForUser(order.customerId(),
                Templates.refundIssued(order.orderNumber(), orderId.toString(), amountPaise), orderId,
                "refund:" + refundId));
    }

    public void deliveryAssigned(UUID orderId, UUID partnerId, Instant at) {
        if (!fresh(at)) {
            return;
        }
        Optional<OrderRef> order = replicas.order(orderId);
        notifications.createForUser(partnerId, Templates.jobAssigned(order.map(OrderRef::orderNumber).orElse(null),
                orderId.toString(), order.map(OrderRef::restaurantName).orElse(null)), orderId,
                "assigned:" + orderId + ":" + partnerId);
    }

    /** DPDP erasure: forget the person's contacts, inbox and queued messages. */
    public void userDeleted(UUID userId) {
        replicas.deleteContact(userId);
        notifications.deleteAllFor(userId);
    }

    /**
     * Payment and refund events only carry the order id. If the order feed has not delivered that order yet the
     * event fails and is retried on the next poll; a stale event for an unknown order is simply dropped.
     */
    private void withOrder(UUID orderId, Instant at, String eventType, java.util.function.Consumer<OrderRef> action) {
        Optional<OrderRef> order = replicas.order(orderId);
        if (order.isEmpty()) {
            if (!fresh(at)) {
                log.info("Dropping stale {} for unknown order {}", eventType, orderId);
                return;
            }
            throw new IllegalStateException(eventType + " refers to order " + orderId + " which is not known yet");
        }
        if (fresh(at)) {
            action.accept(order.get());
        }
    }

    /** Exposed for the handler of UserContactUpdated; kept here so all writes go through one service. */
    public void contactUpdated(UUID userId, String phoneEnc, String emailEnc) {
        replicas.upsertContact(userId, phoneEnc, emailEnc);
    }

    public void restaurantUpserted(UUID restaurantId, UUID ownerUserId, String name) {
        replicas.upsertRestaurant(restaurantId, ownerUserId, name);
    }
}
