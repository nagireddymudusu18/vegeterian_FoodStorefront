package in.foodapp.order.events.stream;

import static org.assertj.core.api.Assertions.assertThat;

import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.service.OrderStatusChangedEvent;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderStreamHubTest {

    private final OrderStreamHub hub = new OrderStreamHub(Runnable::run);

    static class FakeSink implements OrderStreamHub.Sink {
        final List<String> statuses = new ArrayList<>();
        int pings;
        boolean broken;

        @Override
        public void status(String status) throws IOException {
            if (broken) {
                throw new IOException("closed");
            }
            statuses.add(status);
        }

        @Override
        public void ping() throws IOException {
            if (broken) {
                throw new IOException("closed");
            }
            pings++;
        }
    }

    @Test
    void deliversStatusChangeOnlyToSinksOfThatOrder() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        FakeSink sa = new FakeSink();
        FakeSink sb = new FakeSink();
        hub.register(a, sa);
        hub.register(b, sb);

        hub.onStatusChanged(new OrderStatusChangedEvent(a, OrderStatus.PAID));

        assertThat(sa.statuses).containsExactly("PAID");
        assertThat(sb.statuses).isEmpty();
    }

    @Test
    void capsConnectionsPerOrder() {
        UUID id = UUID.randomUUID();
        for (int i = 0; i < OrderStreamHub.MAX_PER_ORDER; i++) {
            assertThat(hub.register(id, new FakeSink())).isTrue();
        }
        assertThat(hub.register(id, new FakeSink())).isFalse();
        assertThat(hub.openConnections()).isEqualTo(OrderStreamHub.MAX_PER_ORDER);
    }

    @Test
    void unregisterFreesASlot() {
        UUID id = UUID.randomUUID();
        FakeSink first = new FakeSink();
        hub.register(id, first);
        for (int i = 1; i < OrderStreamHub.MAX_PER_ORDER; i++) {
            hub.register(id, new FakeSink());
        }
        hub.unregister(id, first);
        assertThat(hub.openConnections()).isEqualTo(OrderStreamHub.MAX_PER_ORDER - 1);
        assertThat(hub.register(id, new FakeSink())).isTrue();
    }

    @Test
    void dropsSinkWhoseSendFails() {
        UUID id = UUID.randomUUID();
        FakeSink dead = new FakeSink();
        dead.broken = true;
        FakeSink live = new FakeSink();
        hub.register(id, dead);
        hub.register(id, live);

        hub.onStatusChanged(new OrderStatusChangedEvent(id, OrderStatus.MERCHANT_ACCEPTED));

        assertThat(hub.openConnections()).isEqualTo(1);
        assertThat(live.statuses).containsExactly("MERCHANT_ACCEPTED");
    }

    @Test
    void heartbeatPingsEverySinkAndDropsDeadOnes() {
        UUID id = UUID.randomUUID();
        FakeSink live = new FakeSink();
        FakeSink dead = new FakeSink();
        dead.broken = true;
        hub.register(id, live);
        hub.register(id, dead);

        hub.heartbeat();

        assertThat(live.pings).isEqualTo(1);
        assertThat(hub.openConnections()).isEqualTo(1);
    }

    @Test
    void openSendsCurrentStatusFirstAndRefusesWhenOrderIsFull() {
        UUID id = UUID.randomUUID();
        for (int i = 0; i < OrderStreamHub.MAX_PER_ORDER; i++) {
            assertThat(hub.open(id, "CREATED")).isPresent();
        }
        assertThat(hub.open(id, "CREATED")).isEmpty();
    }
}
