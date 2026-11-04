package in.foodapp.notification.events.consumer;

import static in.foodapp.notification.events.consumer.MalformedEventException.number;
import static in.foodapp.notification.events.consumer.MalformedEventException.optText;
import static in.foodapp.notification.events.consumer.MalformedEventException.optUuid;
import static in.foodapp.notification.events.consumer.MalformedEventException.text;
import static in.foodapp.notification.events.consumer.MalformedEventException.uuid;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.notification.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.notification.service.Notifier;
import org.springframework.stereotype.Component;

/**
 * One handler per producer feed. A handler reads the fields it needs, throws {@link MalformedEventException} for a
 * bad payload (the poller parks that event) and ignores every event type it does not care about.
 */
@Component
public class EventHandlers {

    private final Notifier notifier;

    public EventHandlers(Notifier notifier) {
        this.notifier = notifier;
    }

    /** identity-service: verified contacts and account erasure. */
    public void identity(FeedEvent event) {
        JsonNode p = event.payload();
        switch (event.type()) {
            case "UserContactUpdated" -> {
                String phone = optText(p, "phoneEnc");
                String email = optText(p, "emailEnc");
                if (phone == null && email == null) {
                    throw new MalformedEventException("UserContactUpdated carries neither phoneEnc nor emailEnc");
                }
                notifier.contactUpdated(uuid(p, "userId"), phone, email);
            }
            case "UserDeleted" -> notifier.userDeleted(uuid(p, "userId"));
            default -> {
            }
        }
    }

    /** catalog-service: who owns which restaurant. */
    public void catalog(FeedEvent event) {
        if ("RestaurantUpserted".equals(event.type())) {
            JsonNode p = event.payload();
            notifier.restaurantUpserted(uuid(p, "restaurantId"), optUuid(p, "ownerUserId"), text(p, "name"));
        }
    }

    /** order-service: order placed and every status change. */
    public void order(FeedEvent event) {
        JsonNode p = event.payload();
        switch (event.type()) {
            case "OrderCreated" -> notifier.orderCreated(uuid(p, "orderId"), uuid(p, "customerId"),
                    uuid(p, "restaurantId"), number(p, "totalPaise"), event.occurredAt());
            case "OrderStatusChanged" -> notifier.orderStatusChanged(uuid(p, "orderId"), uuid(p, "customerId"),
                    uuid(p, "restaurantId"), text(p, "to"), number(p, "totalPaise"), optText(p, "orderNumber"),
                    optText(p, "restaurantName"), event.occurredAt());
            default -> {
            }
        }
    }

    /** payment-service: failures and refunds. */
    public void payment(FeedEvent event) {
        JsonNode p = event.payload();
        switch (event.type()) {
            case "PaymentFailed" -> notifier.paymentFailed(uuid(p, "paymentId"), uuid(p, "orderId"),
                    event.occurredAt());
            case "RefundIssued" -> notifier.refundIssued(uuid(p, "refundId"), uuid(p, "orderId"),
                    number(p, "amountPaise"), event.occurredAt());
            default -> {
            }
        }
    }

    /** fleet-service: a partner took a job. */
    public void fleet(FeedEvent event) {
        if ("DeliveryAssigned".equals(event.type())) {
            JsonNode p = event.payload();
            notifier.deliveryAssigned(uuid(p, "orderId"), uuid(p, "partnerId"), event.occurredAt());
        }
    }
}
