package in.foodapp.order.service;

import in.foodapp.order.api.ApiException;
import in.foodapp.order.api.CreateOrderRequest;
import in.foodapp.order.api.OrderView;
import in.foodapp.order.api.RiderOrderView;
import in.foodapp.order.api.StaffOrderView;
import in.foodapp.order.api.TrackView;
import in.foodapp.order.domain.OrderNumbers;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.events.outbox.OutboxService;
import in.foodapp.order.persistence.Order;
import in.foodapp.order.persistence.OrderEvent;
import in.foodapp.order.persistence.OrderEventRepository;
import in.foodapp.order.persistence.OrderItem;
import in.foodapp.order.persistence.OrderRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class OrderService {

    public static final int MAX_OTP_ATTEMPTS = 5;
    private static final int MAX_IDEMPOTENCY_KEY_LENGTH = 128;
    private static final Set<OrderStatus> STAFF_TARGETS = Set.of(
            OrderStatus.MERCHANT_ACCEPTED, OrderStatus.REJECTED_BY_MERCHANT, OrderStatus.PREPARING,
            OrderStatus.RIDER_ASSIGNED, OrderStatus.PICKED_UP);

    public record CreateResult(OrderView order, boolean replayed) {
    }

    private final OrderRepository orders;
    private final OrderEventRepository events;
    private final RestaurantReplicaRepository restaurants;
    private final PricingService pricing;
    private final OrderTransitionService transitions;
    private final OutboxService outbox;
    private final TransactionTemplate tx;
    private final SecureRandom random = new SecureRandom();

    public OrderService(OrderRepository orders, OrderEventRepository events, RestaurantReplicaRepository restaurants,
                        PricingService pricing, OrderTransitionService transitions, OutboxService outbox,
                        TransactionTemplate tx) {
        this.orders = orders;
        this.events = events;
        this.restaurants = restaurants;
        this.pricing = pricing;
        this.transitions = transitions;
        this.outbox = outbox;
        this.tx = tx;
    }

    // ---------------------------------------------------------------- create

    public CreateResult create(UUID customerId, String idempotencyKey, CreateOrderRequest request) {
        String key = idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey.trim();
        if (key != null && key.length() > MAX_IDEMPOTENCY_KEY_LENGTH) {
            throw ApiException.badRequest("Invalid Idempotency-Key", "Idempotency-Key is too long");
        }
        try {
            return tx.execute(status -> createInTx(customerId, key, request));
        } catch (DataIntegrityViolationException e) {
            if (key != null) {
                // lost a race with a concurrent request carrying the same key: return the winner's order
                CreateResult replay = tx.execute(status -> findReplay(customerId, key));
                if (replay != null) {
                    return replay;
                }
            }
            throw e;
        }
    }

    private CreateResult findReplay(UUID customerId, String key) {
        return orders.findByCustomerIdAndIdempotencyKey(customerId, key)
                .map(o -> new CreateResult(OrderView.from(o, true), true))
                .orElse(null);
    }

    private CreateResult createInTx(UUID customerId, String key, CreateOrderRequest request) {
        if (key != null) {
            CreateResult existing = findReplay(customerId, key);
            if (existing != null) {
                return existing;
            }
        }
        List<PricingService.LineRequest> lines = request.lines().stream()
                .map(l -> new PricingService.LineRequest(l.itemId(), l.quantity()))
                .toList();
        PricingService.PricedOrder priced = pricing.price(request.restaurantId(), lines);

        Instant now = Instant.now();
        Order order = new Order(UUID.randomUUID(), customerId, priced.restaurantId(), priced.subtotalPaise(),
                priced.taxPaise(), priced.deliveryFeePaise(), priced.totalPaise(), key, now);
        for (PricingService.PricedLine l : priced.lines()) {
            order.addItem(new OrderItem(l.itemId(), l.name(), l.unitPricePaise(), l.quantity(),
                    l.lineTotalPaise()));
        }
        orders.saveAndFlush(order);
        events.save(new OrderEvent(order.getId(), null, OrderStatus.CREATED, "ORDER_CREATED", now));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", order.getId().toString());
        payload.put("customerId", customerId.toString());
        payload.put("restaurantId", order.getRestaurantId().toString());
        payload.put("totalPaise", order.getTotalPaise());
        outbox.append("OrderCreated", order.getId(), payload);
        return new CreateResult(OrderView.from(order, true), false);
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public OrderView get(UUID orderId, UUID callerId, boolean admin) {
        Order order = load(orderId);
        boolean owner = order.getCustomerId().equals(callerId);
        if (!owner && !admin) {
            throw ApiException.forbidden("You do not own this order");
        }
        return OrderView.from(order, owner);
    }

    /** Public lookup by order number. Any malformed or unknown number yields the same 404. */
    @Transactional(readOnly = true)
    public TrackView track(String rawNumber) {
        String number = OrderNumbers.parse(rawNumber)
                .orElseThrow(() -> ApiException.notFound("Order not found"));
        Order order = orders.findWithItemsByOrderNumber(number)
                .orElseThrow(() -> ApiException.notFound("Order not found"));
        String restaurant = restaurants.findById(order.getRestaurantId()).map(RestaurantReplica::getName)
                .orElse("Restaurant");
        return TrackView.from(order, restaurant, events.findByOrderIdOrderByIdAsc(order.getId()));
    }

    @Transactional(readOnly = true)
    public List<OrderView> list(UUID customerId) {
        return orders.findByCustomerIdOrderByCreatedAtDesc(customerId).stream()
                .map(o -> OrderView.from(o, true))
                .toList();
    }

    /**
     * Orders a restaurant works on (or its recent history). A RESTAURANT caller sees only restaurants whose replicated
     * owner is the caller; ADMIN sees all.
     */
    @Transactional(readOnly = true)
    public List<StaffOrderView> staffOrders(StaffCaller caller, boolean history) {
        List<OrderStatus> statuses = history
                ? List.of(OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REJECTED_BY_MERCHANT, OrderStatus.REFUNDED)
                : List.of(OrderStatus.PAID, OrderStatus.MERCHANT_ACCEPTED, OrderStatus.PREPARING,
                        OrderStatus.RIDER_ASSIGNED, OrderStatus.PICKED_UP);
        List<Order> found;
        if (caller.admin()) {
            found = orders.findByStatusInOrderByCreatedAtDesc(statuses);
        } else {
            List<UUID> mine = restaurants.findByOwnerUserId(caller.userId()).stream()
                    .map(RestaurantReplica::getRestaurantId).toList();
            if (mine.isEmpty()) {
                return List.of();
            }
            found = orders.findByRestaurantIdInAndStatusInOrderByCreatedAtDesc(mine, statuses);
        }
        Map<UUID, String> names = new HashMap<>();
        return found.stream().limit(100)
                .map(o -> StaffOrderView.from(o, names.computeIfAbsent(o.getRestaurantId(),
                        id -> restaurants.findById(id).map(RestaurantReplica::getName).orElse("Restaurant"))))
                .toList();
    }

    // ---------------------------------------------------------------- customer

    @Transactional
    public OrderView cancel(UUID orderId, UUID customerId) {
        Order order = load(orderId);
        if (!order.getCustomerId().equals(customerId)) {
            throw ApiException.forbidden("You do not own this order");
        }
        transitions.transition(order, OrderStatus.CANCELLED, "CUSTOMER_CANCELLED");
        return OrderView.from(order, true);
    }

    // ---------------------------------------------------------------- merchant / admin

    @Transactional
    public OrderView staffTransition(UUID orderId, StaffCaller caller, OrderStatus to, String reason) {
        if (!STAFF_TARGETS.contains(to)) {
            throw new IllegalArgumentException("Not a staff transition: " + to);
        }
        Order order = loadForStaff(orderId, caller);
        transitions.transition(order, to, reason == null || reason.isBlank() ? "STAFF_" + to : reason);
        if (to == OrderStatus.PICKED_UP) {
            order.setDeliveryOtp(String.format("%04d", random.nextInt(10_000)));
            order.setOtpAttempts(0);
            orders.save(order);
        }
        return OrderView.from(order, false);
    }

    /** The assigned delivery partner marks the order picked up; the customer then receives the delivery OTP. */
    @Transactional
    public RiderOrderView riderPickedUp(UUID orderId, UUID riderId) {
        Order order = loadForRider(orderId, riderId);
        transitions.transition(order, OrderStatus.PICKED_UP, "RIDER_PICKED_UP");
        order.setDeliveryOtp(String.format("%04d", random.nextInt(10_000)));
        order.setOtpAttempts(0);
        orders.save(order);
        return RiderOrderView.from(order);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public RiderOrderView riderDeliver(UUID orderId, UUID riderId, String otp) {
        loadForRider(orderId, riderId);
        OrderView v = deliver(orderId, StaffCaller.admin(riderId), otp);
        return new RiderOrderView(v.id(), v.orderNumber(), v.status());
    }

    /**
     * Verifies the delivery OTP. Failed attempts are persisted (noRollbackFor) so the per-order limit of
     * {@value #MAX_OTP_ATTEMPTS} cannot be bypassed by the rollback of the failing request.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public OrderView deliver(UUID orderId, StaffCaller caller, String otp) {
        Order order = loadForStaff(orderId, caller);
        if (order.getStatus() != OrderStatus.PICKED_UP) {
            // let the state machine produce the 409 for anything that is not PICKED_UP
            transitions.transition(order, OrderStatus.DELIVERED, "OTP_VERIFIED");
        }
        if (order.getOtpAttempts() >= MAX_OTP_ATTEMPTS) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts",
                    "Maximum OTP attempts reached for this order");
        }
        String expected = order.getDeliveryOtp();
        boolean ok = expected != null && otp != null && MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8), otp.getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            order.setOtpAttempts(order.getOtpAttempts() + 1);
            orders.save(order);
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid OTP", "The delivery OTP is incorrect")
                    .with("attemptsRemaining", MAX_OTP_ATTEMPTS - order.getOtpAttempts());
        }
        transitions.transition(order, OrderStatus.DELIVERED, "OTP_VERIFIED");
        order.setDeliveryOtp(null);
        order.setOtpAttempts(0);
        orders.save(order);
        return OrderView.from(order, false);
    }

    /** Only the partner fleet-service assigned may act; anyone else gets 403. */
    private Order loadForRider(UUID orderId, UUID riderId) {
        Order order = load(orderId);
        if (riderId == null || !riderId.equals(order.getRiderUserId())) {
            throw ApiException.forbidden("This order is not assigned to you");
        }
        return order;
    }

    private Order load(UUID orderId) {
        Optional<Order> o = orders.findWithItemsById(orderId);
        return o.orElseThrow(() -> ApiException.notFound("Order not found"));
    }

    /**
     * The single authorization point for every staff endpoint. ADMIN may act on any order; a RESTAURANT user only
     * on orders of a restaurant whose replicated owner_user_id equals the caller's id. An unknown restaurant or a
     * null owner is denied. Same 404 (missing) / 403 (not yours) behaviour as the customer endpoints.
     */
    private Order loadForStaff(UUID orderId, StaffCaller caller) {
        Order order = load(orderId);
        if (caller.admin()) {
            return order;
        }
        UUID owner = restaurants.findById(order.getRestaurantId())
                .map(RestaurantReplica::getOwnerUserId)
                .orElse(null);
        if (owner == null || caller.userId() == null || !owner.equals(caller.userId())) {
            throw ApiException.forbidden("You do not manage this restaurant's orders");
        }
        return order;
    }
}
