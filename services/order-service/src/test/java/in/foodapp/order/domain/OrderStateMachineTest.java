package in.foodapp.order.domain;

import static in.foodapp.order.domain.OrderStatus.CANCELLED;
import static in.foodapp.order.domain.OrderStatus.CREATED;
import static in.foodapp.order.domain.OrderStatus.DELIVERED;
import static in.foodapp.order.domain.OrderStatus.MERCHANT_ACCEPTED;
import static in.foodapp.order.domain.OrderStatus.PAID;
import static in.foodapp.order.domain.OrderStatus.PAYMENT_FAILED;
import static in.foodapp.order.domain.OrderStatus.PICKED_UP;
import static in.foodapp.order.domain.OrderStatus.PREPARING;
import static in.foodapp.order.domain.OrderStatus.REFUNDED;
import static in.foodapp.order.domain.OrderStatus.REJECTED_BY_MERCHANT;
import static in.foodapp.order.domain.OrderStatus.RIDER_ASSIGNED;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class OrderStateMachineTest {

    /** Independent restatement of the spec; every (from,to) pair is checked against it. */
    private static final Map<OrderStatus, Set<OrderStatus>> LEGAL = new EnumMap<>(OrderStatus.class);

    static {
        for (OrderStatus s : OrderStatus.values()) {
            LEGAL.put(s, Set.of());
        }
        LEGAL.put(CREATED, Set.of(PAID, PAYMENT_FAILED, CANCELLED));
        LEGAL.put(PAID, Set.of(MERCHANT_ACCEPTED, REJECTED_BY_MERCHANT, CANCELLED));
        LEGAL.put(MERCHANT_ACCEPTED, Set.of(PREPARING, CANCELLED));
        LEGAL.put(PREPARING, Set.of(RIDER_ASSIGNED, CANCELLED));
        LEGAL.put(RIDER_ASSIGNED, Set.of(PICKED_UP));
        LEGAL.put(PICKED_UP, Set.of(DELIVERED));
        LEGAL.put(REJECTED_BY_MERCHANT, Set.of(REFUNDED));
        LEGAL.put(CANCELLED, Set.of(REFUNDED));
    }

    @Test
    void everyPairMatchesTheTransitionTable() {
        int checked = 0;
        for (OrderStatus from : OrderStatus.values()) {
            for (OrderStatus to : OrderStatus.values()) {
                boolean legal = LEGAL.get(from).contains(to);
                // wasPaid=true so the CANCELLED -> REFUNDED guard does not interfere here
                assertThat(OrderStateMachine.canTransition(from, to, true))
                        .as("%s -> %s", from, to).isEqualTo(legal);
                assertThat(OrderStateMachine.isAllowed(from, to)).as("%s -> %s", from, to).isEqualTo(legal);
                if (legal) {
                    OrderStateMachine.validate(from, to, true);
                } else {
                    assertThatThrownBy(() -> OrderStateMachine.validate(from, to, true))
                            .as("%s -> %s", from, to)
                            .isInstanceOf(IllegalTransitionException.class);
                }
                checked++;
            }
        }
        assertThat(checked).isEqualTo(OrderStatus.values().length * OrderStatus.values().length);
    }

    @Test
    void happyPathChain() {
        OrderStatus[] path = {CREATED, PAID, MERCHANT_ACCEPTED, PREPARING, RIDER_ASSIGNED, PICKED_UP, DELIVERED};
        for (int i = 0; i < path.length - 1; i++) {
            OrderStateMachine.validate(path[i], path[i + 1], false);
        }
    }

    @Test
    void cancelledToRefundedRequiresThatTheOrderWasPaid() {
        assertThat(OrderStateMachine.canTransition(CANCELLED, REFUNDED, true)).isTrue();
        assertThat(OrderStateMachine.canTransition(CANCELLED, REFUNDED, false)).isFalse();
        assertThatThrownBy(() -> OrderStateMachine.validate(CANCELLED, REFUNDED, false))
                .isInstanceOf(IllegalTransitionException.class);
    }

    @Test
    void rejectedByMerchantToRefundedDoesNotDependOnWasPaidFlag() {
        assertThat(OrderStateMachine.canTransition(REJECTED_BY_MERCHANT, REFUNDED, false)).isTrue();
    }

    @Test
    void customerCannotCancelOnceRiderAssignedOrLater() {
        for (OrderStatus s : new OrderStatus[] {RIDER_ASSIGNED, PICKED_UP, DELIVERED, PAYMENT_FAILED, REFUNDED}) {
            assertThat(OrderStateMachine.canTransition(s, CANCELLED, true)).as("%s -> CANCELLED", s).isFalse();
        }
    }

    @Test
    void terminalStatesHaveNoOutgoingTransitionsExceptRefundPaths() {
        assertThat(OrderStateMachine.allowedFrom(DELIVERED)).isEmpty();
        assertThat(OrderStateMachine.allowedFrom(PAYMENT_FAILED)).isEmpty();
        assertThat(OrderStateMachine.allowedFrom(REFUNDED)).isEmpty();
    }

    @Test
    void exceptionCarriesFromAndTo() {
        assertThatThrownBy(() -> OrderStateMachine.validate(DELIVERED, CREATED, true))
                .isInstanceOfSatisfying(IllegalTransitionException.class, e -> {
                    assertThat(e.getFrom()).isEqualTo(DELIVERED);
                    assertThat(e.getTo()).isEqualTo(CREATED);
                });
    }
}
