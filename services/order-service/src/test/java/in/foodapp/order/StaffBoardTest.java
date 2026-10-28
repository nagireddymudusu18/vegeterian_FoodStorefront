package in.foodapp.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.foodapp.order.events.stream.StaffStreamHub;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class StaffBoardTest extends AbstractIntegrationTest {

    @Autowired
    StaffStreamHub hub;

    private UUID paidOrder(UUID restaurant) throws Exception {
        UUID item = seedItem(restaurant, 10_000, true);
        String body = mvc.perform(post("/orders").with(customer(UUID.randomUUID()))
                        .contentType(MediaType.APPLICATION_JSON).content(orderBody(restaurant, item, 2)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id = UUID.fromString(json(body).get("id").asText());
        jdbc.update("UPDATE orders SET status = 'PAID', was_paid = TRUE WHERE id = ?", id);
        return id;
    }

    @Test
    void restaurantSeesOnlyItsOwnOrdersWithoutCustomerDetails() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID mine = paidOrder(seedRestaurant(true, owner));
        UUID other = paidOrder(seedRestaurant(true, UUID.randomUUID()));

        String body = mvc.perform(get("/orders/restaurant").with(staff(owner, "RESTAURANT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].customerId").doesNotExist())
                .andExpect(jsonPath("$[0].deliveryOtp").doesNotExist())
                .andExpect(jsonPath("$[0].items[0].quantity").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains(mine.toString()).doesNotContain(other.toString());

        String all = mvc.perform(get("/orders/restaurant").with(staff(UUID.randomUUID(), "ADMIN")))
                .andReturn().getResponse().getContentAsString();
        assertThat(all).contains(mine.toString()).contains(other.toString());

        mvc.perform(get("/orders/restaurant").with(staff(UUID.randomUUID(), "RESTAURANT")))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        mvc.perform(get("/orders/restaurant").with(customer(UUID.randomUUID()))).andExpect(status().isForbidden());
        mvc.perform(get("/orders/restaurant/stream").with(customer(UUID.randomUUID())))
                .andExpect(status().isForbidden());
        mvc.perform(get("/orders/restaurant")).andExpect(status().isUnauthorized());
    }

    @Test
    void streamOpensForRestaurantStaffAndIsLimitedPerUser() throws Exception {
        UUID owner = UUID.randomUUID();
        for (int i = 0; i < 5; i++) {
            assertThat(hub.open(owner, false)).isPresent();
        }
        assertThat(hub.open(owner, false)).isEmpty();
        assertThat(hub.open(UUID.randomUUID(), false)).isPresent();
    }
}
