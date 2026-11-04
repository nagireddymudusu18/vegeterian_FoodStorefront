package in.foodapp.order.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.order.AbstractIntegrationTest;
import in.foodapp.order.contract.ContractSchemas;
import in.foodapp.order.persistence.FeedFailureStore;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Admin handling of parked feed events: list, retry, discard. */
class DeadLetterApiIntegrationTest extends AbstractIntegrationTest {

    private static final AtomicLong EVENT_IDS = new AtomicLong(30_000_000);

    @Autowired
    FeedFailureStore failures;

    private long park(String type, JsonNode payload) {
        long eventId = EVENT_IDS.incrementAndGet();
        failures.park("catalog", eventId, type, UUID.randomUUID(), payload.toString(), "Malformed event: test", 1);
        Long id = jdbc.queryForObject("SELECT id FROM feed_dead_letter WHERE source = 'catalog' AND event_id = ?",
                Long.class, eventId);
        return id == null ? -1 : id;
    }

    @Test
    void onlyAdminsCanSeeOrChangeDeadLetters() throws Exception {
        long id = park("MenuItemUpserted", om.createObjectNode());
        mvc.perform(get("/admin/dead-letters")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/dead-letters").with(customer(UUID.randomUUID()))).andExpect(status().isForbidden());
        mvc.perform(post("/admin/dead-letters/" + id + "/discard").with(staff(UUID.randomUUID(), "RESTAURANT")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/dead-letters").with(staff(UUID.randomUUID(), "ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.open").isNumber())
                .andExpect(jsonPath("$.items[?(@.id == %d)].eventType", id).value("MenuItemUpserted"));
    }

    @Test
    void retryAppliesAFixedEventAndResolvesIt() throws Exception {
        UUID item = UUID.randomUUID();
        var payload = ContractSchemas.example("MenuItemUpserted");
        payload.put("itemId", item.toString());
        payload.put("restaurantId", UUID.randomUUID().toString());
        long id = park("MenuItemUpserted", payload);
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/admin/dead-letters/" + id + "/retry").with(staff(admin, "ADMIN")))
                .andExpect(status().isNoContent());

        assertThat(items.findById(item)).isPresent();
        String resolution = jdbc.queryForObject("SELECT resolution FROM feed_dead_letter WHERE id = ?",
                String.class, id);
        assertThat(resolution).isEqualTo("RETRIED");
        mvc.perform(post("/admin/dead-letters/" + id + "/retry").with(staff(admin, "ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    void retryOfAStillBrokenEventStaysParkedAndCanBeDiscarded() throws Exception {
        long id = park("MenuItemUpserted", om.createObjectNode()); // fields missing
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/admin/dead-letters/" + id + "/retry").with(staff(admin, "ADMIN")))
                .andExpect(status().isUnprocessableEntity());
        assertThat(failures.findOpen(id)).isPresent();

        mvc.perform(post("/admin/dead-letters/" + id + "/discard").with(staff(admin, "ADMIN")))
                .andExpect(status().isNoContent());
        assertThat(failures.findOpen(id)).isEmpty();
        mvc.perform(post("/admin/dead-letters/" + id + "/discard").with(staff(admin, "ADMIN")))
                .andExpect(status().isNotFound());
    }
}
