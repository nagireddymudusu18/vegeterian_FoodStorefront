package in.foodapp.notification.domain;

import java.util.Optional;

/**
 * The wording and the channel policy for every notification. Pure functions, so the whole policy is unit tested.
 * Channel policy: everything lands in the in-app inbox; email is for things worth keeping (confirmation, delivery,
 * cancellation, payment and refund news); SMS only for the few moments a person must not miss (out for delivery,
 * cancelled).
 */
public final class Templates {

    private Templates() {
    }

    /** {@code 72090} becomes {@code ₹720.90}. */
    public static String rupees(long paise) {
        return "\u20B9" + (paise / 100) + "." + String.format("%02d", Math.abs(paise % 100));
    }

    private static String label(String orderNumber, String orderId) {
        if (orderNumber != null && !orderNumber.isBlank()) {
            return orderNumber;
        }
        return orderId == null ? "#order" : "#" + orderId.substring(0, Math.min(8, orderId.length()));
    }

    private static String from(String restaurantName) {
        return restaurantName == null || restaurantName.isBlank() ? "" : " from " + restaurantName;
    }

    public static Message orderPlaced(long totalPaise) {
        return Message.inApp("ORDER_PLACED", "Order placed",
                "Your order of " + rupees(totalPaise) + " is placed. We will confirm it once the payment goes through.");
    }

    /** What the customer hears when an order reaches {@code to}; empty for statuses that say nothing new. */
    public static Optional<Message> customerStatus(String to, String orderNumber, String orderId,
                                                   String restaurantName) {
        String order = label(orderNumber, orderId);
        String from = from(restaurantName);
        return Optional.ofNullable(switch (to) {
            case "PAID" -> Message.inApp("ORDER_PAID", "Order confirmed",
                    "Payment received. Order " + order + from + " is confirmed and sent to the restaurant.").withEmail();
            case "MERCHANT_ACCEPTED" -> Message.inApp("ORDER_ACCEPTED", "Restaurant accepted your order",
                    "Order " + order + from + " was accepted and will be prepared shortly.");
            case "PREPARING" -> Message.inApp("ORDER_PREPARING", "Your food is being prepared",
                    "Order " + order + from + " is being prepared.");
            case "RIDER_ASSIGNED" -> Message.inApp("ORDER_RIDER_ASSIGNED", "Delivery partner assigned",
                    "A delivery partner will collect order " + order + from + ".");
            case "PICKED_UP" -> Message.inApp("ORDER_OUT_FOR_DELIVERY", "Out for delivery",
                    "Order " + order + from + " is on its way. Keep your delivery code ready.").withSms();
            case "DELIVERED" -> Message.inApp("ORDER_DELIVERED", "Delivered",
                    "Order " + order + from + " was delivered. Enjoy your meal!").withEmail();
            case "CANCELLED" -> Message.inApp("ORDER_CANCELLED", "Order cancelled",
                    "Order " + order + from + " was cancelled.").withEmail().withSms();
            case "REJECTED_BY_MERCHANT" -> Message.inApp("ORDER_REJECTED", "Restaurant could not take your order",
                    "Order " + order + from + " was declined by the restaurant. Any payment will be refunded.")
                    .withEmail().withSms();
            default -> null;
        });
    }

    public static Message paymentFailed(String orderNumber, String orderId) {
        return Message.inApp("PAYMENT_FAILED", "Payment failed",
                "We could not take payment for order " + label(orderNumber, orderId) + ". You can try again.")
                .withEmail();
    }

    public static Message refundIssued(String orderNumber, String orderId, long amountPaise) {
        return Message.inApp("REFUND_ISSUED", "Refund issued",
                "A refund of " + rupees(amountPaise) + " for order " + label(orderNumber, orderId)
                        + " is on its way to your original payment method.").withEmail();
    }

    /** To the restaurant owner when an order is paid and waiting. */
    public static Message newOrderForRestaurant(String orderNumber, String orderId, long totalPaise) {
        return Message.inApp("NEW_ORDER", "New order " + label(orderNumber, orderId),
                "A paid order of " + rupees(totalPaise) + " is waiting for you to accept.").withEmail();
    }

    /** Broadcast to every delivery partner when a kitchen starts preparing. */
    public static Message newDeliveryJob(String orderNumber, String orderId, String restaurantName) {
        String where = restaurantName == null || restaurantName.isBlank() ? "a restaurant" : restaurantName;
        return Message.inApp("NEW_JOB", "New delivery job",
                "Pickup from " + where + " (order " + label(orderNumber, orderId) + "). Open the Partner page to accept it.");
    }

    /** To the one partner who took the job. */
    public static Message jobAssigned(String orderNumber, String orderId, String restaurantName) {
        String where = restaurantName == null || restaurantName.isBlank() ? "the restaurant" : restaurantName;
        return Message.inApp("JOB_ASSIGNED", "Delivery assigned to you",
                "Order " + label(orderNumber, orderId) + " is yours. Head to " + where + " for pickup.");
    }
}
