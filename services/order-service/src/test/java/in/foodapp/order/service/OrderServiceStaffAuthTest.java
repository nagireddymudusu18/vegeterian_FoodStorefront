package in.foodapp.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.foodapp.order.api.ApiException;
import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.events.outbox.OutboxService;
import in.foodapp.order.persistence.Order;
import in.foodapp.order.persistence.OrderEventRepository;
import in.foodapp.order.persistence.OrderRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionTemplate;

/** Per-restaurant authorization of the staff endpoints; pure unit test, no Spring/DB. */
class OrderServiceStaffAuthTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final RestaurantReplicaRepository restaurants = mock(RestaurantReplicaRepository.class);
    private final OrderTransitionService transitions = mock(OrderTransitionService.class);

    private final UUID restaurantA = UUID.randomUUID();
    private final UUID restaurantB = UUID.randomUUID();
    private final UUID ownerA = UUID.randomUUID();
    private final UUID ownerB = UUID.randomUUID();
    private final UUID orderOfB = UUID.randomUUID();
    private final UUID orderWithNullOwner = UUID.randomUUID();
    private final UUID restaurantNoOwner = UUID.randomUUID();
    private final UUID orderOfUnknownRestaurant = UUID.randomUUID();

    private OrderService service;

    @BeforeEach
    void setUp() {
        service = new OrderService(orders, mock(OrderEventRepository.class), restaurants,
                mock(PricingService.class), transitions, mock(OutboxService.class), mock(TransactionTemplate.class));
        when(restaurants.findById(restaurantA)).thenReturn(Optional.of(replica(restaurantA, ownerA)));
        when(restaurants.findById(restaurantB)).thenReturn(Optional.of(replica(restaurantB, ownerB)));
        when(restaurants.findById(restaurantNoOwner)).thenReturn(Optional.of(replica(restaurantNoOwner, null)));
        stubOrder(orderOfB, restaurantB, OrderStatus.PAID);
        stubOrder(orderWithNullOwner, restaurantNoOwner, OrderStatus.PAID);
        stubOrder(orderOfUnknownRestaurant, UUID.randomUUID(), OrderStatus.PAID);
    }

    private static RestaurantReplica replica(UUID id, UUID owner) {
        return new RestaurantReplica(id).update("R", 1, 1, true, 5000, "GOLD", "F1", owner, 1);
    }

    private Order stubOrder(UUID id, UUID restaurantId, OrderStatus status) {
        Order o = new Order(id, UUID.randomUUID(), restaurantId, 100, 5, 30, 135, null, Instant.now());
        o.setStatus(status);
        when(orders.findWithItemsById(id)).thenReturn(Optional.of(o));
        return o;
    }

    private static void assertStatus(Throwable t, HttpStatus expected) {
        assertThat(t).isInstanceOf(ApiException.class);
        assertThat(((ApiException) t).getStatus()).isEqualTo(expected);
    }

    @Test
    void staffOfAnotherRestaurantIsForbiddenOnEveryStaffTransition() {
        StaffCaller other = StaffCaller.restaurant(ownerA); // owns A, not B
        for (OrderStatus to : new OrderStatus[] {OrderStatus.MERCHANT_ACCEPTED, OrderStatus.REJECTED_BY_MERCHANT,
                OrderStatus.PREPARING, OrderStatus.RIDER_ASSIGNED, OrderStatus.PICKED_UP}) {
            assertThatThrownBy(() -> service.staffTransition(orderOfB, other, to, null))
                    .satisfies(t -> assertStatus(t, HttpStatus.FORBIDDEN));
        }
        assertThatThrownBy(() -> service.deliver(orderOfB, other, "1234"))
                .satisfies(t -> assertStatus(t, HttpStatus.FORBIDDEN));
        verify(transitions, never()).transition(any(), any(), any());
        verify(orders, never()).save(any());
    }

    @Test
    void ownerMayTransitionOwnRestaurantsOrder() {
        service.staffTransition(orderOfB, StaffCaller.restaurant(ownerB), OrderStatus.MERCHANT_ACCEPTED, null);
        verify(transitions).transition(any(Order.class), any(), anyString());
    }

    @Test
    void ownerMayDeliverOwnRestaurantsOrder() {
        Order o = stubOrder(orderOfB, restaurantB, OrderStatus.PICKED_UP);
        o.setDeliveryOtp("4321");
        service.deliver(orderOfB, StaffCaller.restaurant(ownerB), "4321");
        verify(transitions).transition(o, OrderStatus.DELIVERED, "OTP_VERIFIED");
    }

    @Test
    void adminMayTransitionAnyOrder() {
        service.staffTransition(orderOfB, StaffCaller.admin(UUID.randomUUID()), OrderStatus.PREPARING, null);
        verify(transitions).transition(any(Order.class), any(), anyString());
    }

    @Test
    void restaurantWithNullOwnerDeniesEveryRestaurantUser() {
        // even a caller whose id is "null-like" or random cannot match a null owner
        assertThatThrownBy(() -> service.staffTransition(orderWithNullOwner, StaffCaller.restaurant(ownerA),
                OrderStatus.MERCHANT_ACCEPTED, null)).satisfies(t -> assertStatus(t, HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> service.staffTransition(orderWithNullOwner, new StaffCaller(null, false),
                OrderStatus.MERCHANT_ACCEPTED, null)).satisfies(t -> assertStatus(t, HttpStatus.FORBIDDEN));
        // admin is still allowed
        service.staffTransition(orderWithNullOwner, StaffCaller.admin(UUID.randomUUID()),
                OrderStatus.MERCHANT_ACCEPTED, null);
        verify(transitions).transition(any(Order.class), any(), anyString());
    }

    @Test
    void restaurantMissingFromReplicaIsDeniedForRestaurantUsers() {
        assertThatThrownBy(() -> service.staffTransition(orderOfUnknownRestaurant, StaffCaller.restaurant(ownerA),
                OrderStatus.MERCHANT_ACCEPTED, null)).satisfies(t -> assertStatus(t, HttpStatus.FORBIDDEN));
        verify(transitions, never()).transition(any(), any(), any());
    }

    @Test
    void unknownOrderIs404ForEveryone() {
        UUID missing = UUID.randomUUID();
        when(orders.findWithItemsById(missing)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.staffTransition(missing, StaffCaller.restaurant(ownerA),
                OrderStatus.MERCHANT_ACCEPTED, null)).satisfies(t -> assertStatus(t, HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> service.staffTransition(missing, StaffCaller.admin(ownerA),
                OrderStatus.MERCHANT_ACCEPTED, null)).satisfies(t -> assertStatus(t, HttpStatus.NOT_FOUND));
    }
}
