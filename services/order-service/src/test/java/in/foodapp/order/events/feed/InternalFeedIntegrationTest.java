package in.foodapp.order.events.feed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.order.AbstractIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class InternalFeedIntegrationTest extends AbstractIntegrationTest {

    private void createOrders(int n) throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 1000, true);
        for (int i = 0; i < n; i++) {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/orders")
                            .with(customer(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
                            .content(orderBody(r, item, 1)))
                    .andExpect(status().isCreated());
        }
    }

    private JsonNode feed(long after, int limit) throws Exception {
        return json(mvc.perform(get("/internal/events?after=" + after + "&limit=" + limit)
                        .header("X-Internal-Key", FEED_KEY))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    void rejectsMissingOrWrongKeyWithoutJwt() throws Exception {
        mvc.perform(get("/internal/events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/events").header("X-Internal-Key", "nope")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/events").header("X-Internal-Key", FEED_KEY)).andExpect(status().isOk());
    }

    @Test
    void paginatesInAscendingIdOrder() throws Exception {
        createOrders(5);

        long cursor = 0;
        long previousId = 0;
        int total = 0;
        while (true) {
            JsonNode page = feed(cursor, 2);
            JsonNode events = page.get("events");
            assertThat(events.size()).isLessThanOrEqualTo(2);
            if (events.isEmpty()) {
                assertThat(page.get("nextCursor").asLong()).isEqualTo(cursor);
                break;
            }
            for (JsonNode e : events) {
                long id = e.get("id").asLong();
                assertThat(id).isGreaterThan(previousId);
                // the DB is shared with other test classes, so only the envelope shape is asserted
                assertThat(e.get("type").asText()).isIn("OrderCreated", "OrderStatusChanged");
                assertThat(e.get("aggregateId").asText()).isNotBlank();
                assertThat(e.get("occurredAt").asText()).isNotBlank();
                assertThat(e.get("payload").get("orderId").asText()).isEqualTo(e.get("aggregateId").asText());
                assertThat(e.get("payload").get("totalPaise").asLong()).isPositive();
                previousId = id;
                total++;
            }
            assertThat(page.get("nextCursor").asLong()).isEqualTo(previousId);
            cursor = page.get("nextCursor").asLong();
        }
        assertThat(total).isGreaterThanOrEqualTo(5);
    }

    @Test
    void limitIsClampedAndAfterFiltersOlderEvents() throws Exception {
        createOrders(3);
        JsonNode all = feed(0, 500);
        int n = all.get("events").size();
        assertThat(n).isGreaterThanOrEqualTo(3);
        long firstId = all.get("events").get(0).get("id").asLong();

        JsonNode afterFirst = feed(firstId, 500);
        assertThat(afterFirst.get("events").size()).isEqualTo(n - 1);
        assertThat(feed(0, 0).get("events").size()).isEqualTo(1); // limit < 1 clamps to 1
    }
}
