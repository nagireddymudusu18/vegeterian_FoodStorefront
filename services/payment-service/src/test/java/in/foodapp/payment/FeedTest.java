package in.foodapp.payment;

import in.foodapp.payment.events.OutboxService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FeedTest extends AbstractIntegrationTest {

    @Autowired
    OutboxService outbox;

    @Autowired
    PlatformTransactionManager txManager;

    @Test
    void feedPaginatesAndEnforcesKey() throws Exception {
        Long before = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM outbox", Long.class);
        long after = before == null ? 0 : before;
        UUID aggregate = UUID.randomUUID();
        TransactionTemplate tx = new TransactionTemplate(txManager);
        for (int i = 0; i < 3; i++) {
            final int n = i;
            tx.executeWithoutResult(s -> outbox.publish("PaymentCaptured", aggregate,
                    Map.of("paymentId", aggregate.toString(), "orderId", UUID.randomUUID().toString(),
                            "amountPaise", 100 + n, "gatewayRef", "ref" + n)));
        }

        // page 1: two events
        String page1 = mvc.perform(get("/internal/events").param("after", String.valueOf(after)).param("limit", "2")
                        .header("X-Internal-Key", FEED_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(2)))
                .andExpect(jsonPath("$.events[0].type").value("PaymentCaptured"))
                .andExpect(jsonPath("$.events[0].aggregateId").value(aggregate.toString()))
                .andExpect(jsonPath("$.events[0].payload.amountPaise").value(100))
                .andReturn().getResponse().getContentAsString();
        long cursor = new com.fasterxml.jackson.databind.ObjectMapper().readTree(page1).get("nextCursor").asLong();

        // page 2: the remaining one, then an empty page keeps the cursor
        mvc.perform(get("/internal/events").param("after", String.valueOf(cursor)).param("limit", "2")
                        .header("X-Internal-Key", FEED_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(1)))
                .andExpect(jsonPath("$.events[0].payload.amountPaise").value(102));
        mvc.perform(get("/internal/events").param("after", "999999999").header("X-Internal-Key", FEED_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(0)))
                .andExpect(jsonPath("$.nextCursor").value(999999999));
    }

    @Test
    void wrongOrMissingKeyIs401() throws Exception {
        mvc.perform(get("/internal/events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/events").header("X-Internal-Key", "nope")).andExpect(status().isUnauthorized());
    }
}
