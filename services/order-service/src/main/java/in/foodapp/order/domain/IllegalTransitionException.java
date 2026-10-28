package in.foodapp.order.domain;

/** Thrown when a requested status change is not allowed by {@link OrderStateMachine}. Mapped to HTTP 409. */
public class IllegalTransitionException extends RuntimeException {

    private final OrderStatus from;
    private final OrderStatus to;

    public IllegalTransitionException(OrderStatus from, OrderStatus to) {
        super("Illegal order transition " + from + " -> " + to);
        this.from = from;
        this.to = to;
    }

    public OrderStatus getFrom() {
        return from;
    }

    public OrderStatus getTo() {
        return to;
    }
}
