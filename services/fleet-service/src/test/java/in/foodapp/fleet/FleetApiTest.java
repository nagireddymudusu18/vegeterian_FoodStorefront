package in.foodapp.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.fleet.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.fleet.events.consumer.OrderEventHandler;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class FleetApiTest {

    static final TestDatabase.Conn DB = TestDatabase.start("fleet", false);
    static final String FEED_KEY = "test-feed-key";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.internal-feed-key", () -> FEED_KEY);
        r.add("app.feed.order-key", () -> "");
        r.add("app.max-active-deliveries", () -> "2");
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    OrderEventHandler handler;
    @Autowired
    in.foodapp.fleet.events.outbox.OutboxService outbox;
    @Autowired
    org.springframework.transaction.PlatformTransactionManager txManager;

    @Test
    void outboxRefusesEventsThatBreakTheirContract() {
        var tx = new org.springframework.transaction.support.TransactionTemplate(txManager);
        UUID id = UUID.randomUUID();
        // required fields missing
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError.class, () -> tx.executeWithoutResult(
                s -> outbox.append("DeliveryAssigned", id, Map.of("orderId", id.toString()))));
        // an event type with no contract
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError.class, () -> tx.executeWithoutResult(
                s -> outbox.append("NoSuchEvent", id, Map.of("orderId", id.toString()))));
        // another service's event
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError.class, () -> tx.executeWithoutResult(
                s -> outbox.append("UserDeleted", id, Map.of("userId", id.toString()))));
    }

    private static JwtRequestPostProcessor as(UUID user, String role) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(user.toString()).claim("roles", List.of(role)))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }

    private static final java.util.concurrent.atomic.AtomicLong EVENT = new java.util.concurrent.atomic.AtomicLong();

    private void orderStatus(UUID order, String to) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("orderId", order.toString());
        p.put("restaurantId", UUID.randomUUID().toString());
        p.put("to", to);
        p.put("orderNumber", "FA-TEST-" + order.toString().substring(0, 5));
        p.put("restaurantName", "Test Kitchen");
        JsonNode node = om.valueToTree(p);
        handler.handle(new FeedEvent(EVENT.incrementAndGet(), "OrderStatusChanged", order, Instant.now(), node));
    }

    private UUID partner(String name) throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(post("/fleet/partners/me").with(as(id, "PARTNER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\",\"vehicle\":\"Bike\"}")).andExpect(status().isOk());
        mvc.perform(put("/fleet/me/online").with(as(id, "PARTNER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"online\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.online").value(true));
        return id;
    }

    private String jobStatus(UUID order) {
        return jdbc.queryForObject("SELECT status FROM deliveries WHERE order_id = ?", String.class, order);
    }

    @Test
    void rolesAreEnforced() throws Exception {
        mvc.perform(get("/fleet/pool")).andExpect(status().isUnauthorized());
        mvc.perform(get("/fleet/pool").with(as(UUID.randomUUID(), "CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(get("/fleet/admin/partners").with(as(UUID.randomUUID(), "PARTNER")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/fleet/admin/partners").with(as(UUID.randomUUID(), "ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/fleet/me").with(as(UUID.randomUUID(), "PARTNER"))).andExpect(status().isNotFound());
        mvc.perform(post("/fleet/partners/me").with(as(UUID.randomUUID(), "PARTNER"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\",\"vehicle\":\"Bike\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void offlinePartnersSeeNoPool() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(post("/fleet/partners/me").with(as(id, "PARTNER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Asha\",\"vehicle\":\"Scooter\"}")).andExpect(status().isOk());
        mvc.perform(get("/fleet/pool").with(as(id, "PARTNER"))).andExpect(status().isConflict());
        UUID order = UUID.randomUUID();
        orderStatus(order, "PREPARING");
        mvc.perform(post("/fleet/deliveries/" + order + "/accept").with(as(id, "PARTNER")))
                .andExpect(status().isConflict());
        assertThat(jobStatus(order)).isEqualTo("AVAILABLE");
    }

    @Test
    void onePartnerWinsTheClaimAndOrderStatusIsMirrored() throws Exception {
        UUID a = partner("Ravi");
        UUID b = partner("Sita");
        UUID order = UUID.randomUUID();
        orderStatus(order, "PAID"); // not a delivery yet
        mvc.perform(post("/fleet/deliveries/" + order + "/accept").with(as(a, "PARTNER")))
                .andExpect(status().isNotFound());
        orderStatus(order, "PREPARING");
        orderStatus(order, "PREPARING"); // replay

        mvc.perform(get("/fleet/pool").with(as(b, "PARTNER"))).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.orderId == '" + order + "')]").isNotEmpty());
        mvc.perform(post("/fleet/deliveries/" + order + "/accept").with(as(a, "PARTNER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ASSIGNED"))
                .andExpect(jsonPath("$.partnerId").value(a.toString()));
        mvc.perform(post("/fleet/deliveries/" + order + "/accept").with(as(b, "PARTNER")))
                .andExpect(status().isConflict());
        mvc.perform(get("/fleet/me/deliveries").with(as(a, "PARTNER")))
                .andExpect(jsonPath("$[0].orderId").value(order.toString()));
        mvc.perform(get("/fleet/me/deliveries").with(as(b, "PARTNER"))).andExpect(jsonPath("$").isEmpty());

        mvc.perform(get("/internal/events").header("X-Internal-Key", FEED_KEY)).andExpect(status().isOk())
                .andExpect(jsonPath("$.events[?(@.type == 'DeliveryAssigned' && @.payload.orderId == '" + order
                        + "' && @.payload.partnerId == '" + a + "')]").isNotEmpty());
        mvc.perform(get("/internal/events").header("X-Internal-Key", "wrong")).andExpect(status().isUnauthorized());

        orderStatus(order, "PICKED_UP");
        assertThat(jobStatus(order)).isEqualTo("PICKED_UP");
        orderStatus(order, "DELIVERED");
        assertThat(jobStatus(order)).isEqualTo("DELIVERED");
        mvc.perform(get("/fleet/me/deliveries").with(as(a, "PARTNER"))).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void cancelledOrdersLeaveThePoolAndRestaurantAssignmentClosesTheJob() throws Exception {
        UUID cancelled = UUID.randomUUID();
        orderStatus(cancelled, "PREPARING");
        orderStatus(cancelled, "CANCELLED");
        assertThat(jobStatus(cancelled)).isEqualTo("CANCELLED");

        UUID handled = UUID.randomUUID();
        orderStatus(handled, "PREPARING");
        orderStatus(handled, "RIDER_ASSIGNED");
        assertThat(jobStatus(handled)).isEqualTo("CANCELLED");
    }

    @Test
    void activeDeliveryLimitAndAdminAssignment() throws Exception {
        UUID a = partner("Limit");
        UUID[] orders = {UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()};
        for (UUID o : orders) {
            orderStatus(o, "PREPARING");
        }
        mvc.perform(post("/fleet/deliveries/" + orders[0] + "/accept").with(as(a, "PARTNER")))
                .andExpect(status().isOk());
        mvc.perform(post("/fleet/deliveries/" + orders[1] + "/accept").with(as(a, "PARTNER")))
                .andExpect(status().isOk());
        mvc.perform(post("/fleet/deliveries/" + orders[2] + "/accept").with(as(a, "PARTNER")))
                .andExpect(status().isConflict());

        UUID admin = UUID.randomUUID();
        mvc.perform(post("/fleet/admin/deliveries/" + orders[2] + "/assign").with(as(a, "PARTNER"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"partnerId\":\"" + a + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/fleet/admin/deliveries/" + orders[2] + "/assign").with(as(admin, "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"partnerId\":\"" + UUID.randomUUID() + "\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/fleet/admin/deliveries/" + orders[2] + "/assign").with(as(admin, "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"partnerId\":\"" + a + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ASSIGNED"));
        mvc.perform(post("/fleet/admin/deliveries/" + orders[2] + "/assign").with(as(admin, "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"partnerId\":\"" + a + "\"}"))
                .andExpect(status().isConflict());
        mvc.perform(get("/fleet/admin/deliveries").param("status", "assigned").with(as(admin, "ADMIN")))
                .andExpect(status().isOk());
        mvc.perform(get("/fleet/admin/partners").with(as(admin, "ADMIN")))
                .andExpect(jsonPath("$[?(@.userId == '" + a + "')].activeDeliveries").value(3));
    }
}