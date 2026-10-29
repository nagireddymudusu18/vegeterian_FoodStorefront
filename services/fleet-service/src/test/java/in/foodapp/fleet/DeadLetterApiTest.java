package in.foodapp.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.foodapp.fleet.contract.ContractSchemas;
import in.foodapp.fleet.persistence.FeedFailureStore;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Admin handling of parked feed events: list, retry, discard. */
@SpringBootTest
@AutoConfigureMockMvc
class DeadLetterApiTest {

    static final TestDatabase.Conn DB = TestDatabase.start("fleet", false);
    private static final AtomicLong EVENT_IDS = new AtomicLong(30_000_000);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.internal-feed-key", () -> "test-feed-key");
        r.add("app.feed.order-key", () -> "");
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    FeedFailureStore failures;

    private final ObjectMapper om = new ObjectMapper();

    private static JwtRequestPostProcessor as(UUID user, String role) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(user.toString()).claim("roles", List.of(role)))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }

    private long park(String type, com.fasterxml.jackson.databind.JsonNode payload) {
        long eventId = EVENT_IDS.incrementAndGet();
        failures.park("order", eventId, type, UUID.randomUUID(), payload.toString(), "Malformed event: test", 1);
        Long id = jdbc.queryForObject("SELECT id FROM feed_dead_letter WHERE source = 'order' AND event_id = ?",
                Long.class, eventId);
        return id == null ? -1 : id;
    }

    @Test
    void onlyAdminsCanSeeOrChangeDeadLetters() throws Exception {
        long id = park("OrderStatusChanged", om.createObjectNode());
        mvc.perform(get("/fleet/admin/dead-letters")).andExpect(status().isUnauthorized());
        mvc.perform(get("/fleet/admin/dead-letters").with(as(UUID.randomUUID(), "PARTNER")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/fleet/admin/dead-letters").with(as(UUID.randomUUID(), "ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open").isNumber())
                .andExpect(jsonPath("$.items[?(@.id == %d)].eventType", id).value("OrderStatusChanged"));
    }

    @Test
    void retryAppliesAFixedEventAndResolvesIt() throws Exception {
        UUID order = UUID.randomUUID();
        ObjectNode payload = ContractSchemas.example("OrderStatusChanged");
        payload.put("orderId", order.toString());
        payload.put("to", "PREPARING");
        long id = park("OrderStatusChanged", payload);
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/fleet/admin/dead-letters/" + id + "/retry").with(as(admin, "ADMIN")))
                .andExpect(status().isNoContent());

        String job = jdbc.queryForObject("SELECT status FROM deliveries WHERE order_id = ?", String.class, order);
        assertThat(job).isEqualTo("AVAILABLE");
        assertThat(failures.findOpen(id)).isEmpty();
        mvc.perform(post("/fleet/admin/dead-letters/" + id + "/retry").with(as(admin, "ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    void retryOfAStillBrokenEventStaysParkedAndCanBeDiscarded() throws Exception {
        long id = park("OrderStatusChanged", om.createObjectNode()); // fields missing
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/fleet/admin/dead-letters/" + id + "/retry").with(as(admin, "ADMIN")))
                .andExpect(status().isUnprocessableEntity());
        assertThat(failures.findOpen(id)).isPresent();

        mvc.perform(post("/fleet/admin/dead-letters/" + id + "/discard").with(as(admin, "ADMIN")))
                .andExpect(status().isNoContent());
        assertThat(failures.findOpen(id)).isEmpty();
        mvc.perform(post("/fleet/admin/dead-letters/" + id + "/discard").with(as(admin, "ADMIN")))
                .andExpect(status().isNotFound());
    }
}
