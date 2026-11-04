package in.foodapp.fleet;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.foodapp.fleet.contract.ContractSchemas;
import in.foodapp.fleet.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.fleet.events.consumer.OrderEventHandler;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Consumer side of the OrderStatusChanged contract in contracts/events: the golden example goes through the real
 * handler and the resulting delivery job is checked. Each test asserts the outcome (a delivery job and its fields),
 * not just the absence of an exception.
 */
@SpringBootTest
class ConsumerContractTest {

    static final TestDatabase.Conn DB = TestDatabase.start("fleet", false);
    private static final AtomicLong EVENT_IDS = new AtomicLong(5_000_000);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.internal-feed-key", () -> "test-feed-key");
        r.add("app.feed.order-key", () -> "");
    }

    @Autowired
    OrderEventHandler handler;
    @Autowired
    JdbcTemplate jdbc;

    private FeedEvent delivered(UUID order, ObjectNode payload) {
        ContractSchemas.assertValid("OrderStatusChanged", payload);
        assertThat(ContractSchemas.contract("OrderStatusChanged").get("x-consumers").toString())
                .contains("fleet-service");
        return new FeedEvent(EVENT_IDS.incrementAndGet(), "OrderStatusChanged", order, Instant.now(), payload);
    }

    private ObjectNode statusChange(UUID order, String from, String to) {
        ObjectNode p = ContractSchemas.example("OrderStatusChanged");
        p.put("orderId", order.toString());
        p.put("from", from);
        p.put("to", to);
        return p;
    }

    private Map<String, Object> job(UUID order) {
        return jdbc.queryForMap("SELECT status, order_number, restaurant_name FROM deliveries WHERE order_id = ?", order);
    }

    @Test
    void preparingOpensAJobCarryingTheOrderNumberAndRestaurantName() {
        UUID order = UUID.randomUUID();
        ObjectNode p = statusChange(order, "MERCHANT_ACCEPTED", "PREPARING");
        handler.handle(delivered(order, p));

        Map<String, Object> row = job(order);
        assertThat(row.get("status")).isEqualTo("AVAILABLE");
        assertThat(row.get("order_number")).isEqualTo(p.get("orderNumber").asText());
        assertThat(row.get("restaurant_name")).isEqualTo(p.get("restaurantName").asText());
    }

    @Test
    void theRestaurantNameIsOptionalInTheContract() {
        UUID order = UUID.randomUUID();
        ObjectNode p = statusChange(order, "MERCHANT_ACCEPTED", "PREPARING");
        p.remove("restaurantName");
        handler.handle(delivered(order, p));

        Map<String, Object> row = job(order);
        assertThat(row.get("status")).isEqualTo("AVAILABLE");
        assertThat(row.get("restaurant_name")).isNull();
    }

    @Test
    void cancellationClosesTheJob() {
        UUID order = UUID.randomUUID();
        handler.handle(delivered(order, statusChange(order, "MERCHANT_ACCEPTED", "PREPARING")));
        handler.handle(delivered(order, statusChange(order, "PREPARING", "CANCELLED")));
        assertThat(job(order).get("status")).isEqualTo("CANCELLED");
    }
}
