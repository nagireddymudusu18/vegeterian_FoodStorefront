package in.foodapp.order.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.order.AbstractIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class TrackOrderIntegrationTest extends AbstractIntegrationTest {

    private JsonNode createOrder(UUID customer) throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 10000, true);
        String res = mvc.perform(post("/orders").with(customer(customer)).contentType(MediaType.APPLICATION_JSON)
                        .content(orderBody(r, item, 2)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(res);
    }

    @Test
    void ownerSeesOrderNumberAndAnyoneCanTrackWithoutLogin() throws Exception {
        JsonNode o = createOrder(UUID.randomUUID());
        String number = o.get("orderNumber").asText();
        assertThat(number).matches("FA-[0-9A-Z]{5}-[0-9A-Z]{5}");

        mvc.perform(get("/orders/track/" + number))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderNumber").value(number))
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andExpect(jsonPath("$.totalPaise").value(24000))
                .andExpect(jsonPath("$.items[0].quantity").value(2))
                .andExpect(jsonPath("$.timeline[0].status").value("CREATED"))
                .andExpect(jsonPath("$.customerId").doesNotExist())
                .andExpect(jsonPath("$.id").doesNotExist())
                .andExpect(jsonPath("$.deliveryOtp").doesNotExist());
        // forgiving input
        mvc.perform(get("/orders/track/" + number.toLowerCase().replace("-", "")))
                .andExpect(status().isOk());
    }

    @Test
    void unknownOrMalformedNumbersAreIndistinguishable404s() throws Exception {
        mvc.perform(get("/orders/track/FA-AAAAA-AAAAA")).andExpect(status().isNotFound());
        mvc.perform(get("/orders/track/not-a-number")).andExpect(status().isNotFound());
        mvc.perform(get("/orders/track/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test
    void orderIdRoutesStillRequireAuthentication() throws Exception {
        JsonNode o = createOrder(UUID.randomUUID());
        mvc.perform(get("/orders/" + o.get("id").asText())).andExpect(status().isUnauthorized());
    }

    @Test
    void lookupsAreRateLimitedPerClient() throws Exception {
        int ok = 0;
        int limited = 0;
        for (int i = 0; i < TrackController.MAX_PER_MINUTE + 5; i++) {
            int s = mvc.perform(get("/orders/track/FA-AAAAA-AAAAA").with(r -> {
                r.setRemoteAddr("203.0.113.77");
                return r;
            })).andReturn().getResponse().getStatus();
            if (s == 404) {
                ok++;
            } else if (s == 429) {
                limited++;
            }
        }
        assertThat(ok).isEqualTo(TrackController.MAX_PER_MINUTE);
        assertThat(limited).isEqualTo(5);
    }
}
