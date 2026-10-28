package in.foodapp.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.events.consumer.FleetEventHandler;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class RiderFlowTest extends AbstractIntegrationTest {

    @Autowired
    FleetEventHandler fleet;

    private FeedEvent assigned(long id, UUID order, UUID partner) {
        JsonNode node = new ObjectMapper().valueToTree(
                Map.of("orderId", order.toString(), "partnerId", partner.toString()));
        return new FeedEvent(id, "DeliveryAssigned", order, Instant.now(), node);
    }

    private UUID preparingOrder() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 10_000, true);
        String body = mvc.perform(post("/orders").with(customer(UUID.randomUUID()))
                        .contentType(MediaType.APPLICATION_JSON).content(orderBody(r, item, 1)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id = UUID.fromString(json(body).get("id").asText());
        jdbc.update("UPDATE orders SET status = 'PREPARING', was_paid = TRUE WHERE id = ?", id);
        return id;
    }

    private String statusOf(UUID id) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE id = ?", String.class, id);
    }

    @Test
    void assignedRiderPicksUpAndDeliversWithTheCustomersOtp() throws Exception {
        UUID order = preparingOrder();
        UUID rider = UUID.randomUUID();

        fleet.handle(assigned(1, order, rider));
        assertThat(statusOf(order)).isEqualTo("RIDER_ASSIGNED");
        fleet.handle(assigned(2, order, UUID.randomUUID())); // replay / second assignment is ignored
        assertThat(jdbc.queryForObject("SELECT rider_user_id FROM orders WHERE id = ?", UUID.class, order))
                .isEqualTo(rider);

        mvc.perform(post("/orders/" + order + "/rider/picked-up").with(staff(UUID.randomUUID(), "PARTNER")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + order + "/rider/picked-up").with(customer(rider)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + order + "/rider/picked-up").with(staff(rider, "PARTNER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PICKED_UP"))
                .andExpect(jsonPath("$.customerId").doesNotExist());

        mvc.perform(post("/orders/" + order + "/rider/deliver").with(staff(rider, "PARTNER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"abcd\"}"))
                .andExpect(status().isBadRequest());
        String otp = jdbc.queryForObject("SELECT delivery_otp FROM orders WHERE id = ?", String.class, order);
        String wrong = otp.equals("0000") ? "1111" : "0000";
        mvc.perform(post("/orders/" + order + "/rider/deliver").with(staff(rider, "PARTNER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + wrong + "\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.attemptsRemaining").value(4));
        mvc.perform(post("/orders/" + order + "/rider/deliver").with(staff(rider, "PARTNER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + otp + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DELIVERED"));
    }

    @Test
    void assignmentIsIgnoredWhenTheOrderIsNoLongerPreparing() throws Exception {
        UUID order = preparingOrder();
        jdbc.update("UPDATE orders SET status = 'CANCELLED' WHERE id = ?", order);
        fleet.handle(assigned(3, order, UUID.randomUUID()));
        assertThat(statusOf(order)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT rider_user_id FROM orders WHERE id = ?", UUID.class, order)).isNull();
    }
}