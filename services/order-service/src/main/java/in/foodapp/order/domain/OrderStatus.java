package in.foodapp.order.domain;

public enum OrderStatus {
    CREATED,
    PAID,
    MERCHANT_ACCEPTED,
    PREPARING,
    RIDER_ASSIGNED,
    PICKED_UP,
    DELIVERED,
    PAYMENT_FAILED,
    CANCELLED,
    REJECTED_BY_MERCHANT,
    REFUNDED
}
