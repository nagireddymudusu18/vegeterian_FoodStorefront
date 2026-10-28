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
import org.springframework.test.web.servlet.MvcResult;

class OrderApiIntegrationTest extends AbstractIntegrationTest {

    private MvcResult createOrder(UUID customer, String body, String idempotencyKey) throws Exception {
        var req = post("/orders").with(customer(customer)).contentType(MediaType.APPLICATION_JSON).content(body);
        if (idempotencyKey != null) {
            req = req.header("Idempotency-Key", idempotencyKey);
        }
        return mvc.perform(req).andReturn();
    }

    @Test
    void createsOrderWithServerSidePricing() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 10000, true);
        UUID customer = UUID.randomUUID();

        MvcResult res = createOrder(customer, orderBody(r, item, 2), null);
        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode o = json(res.getResponse().getContentAsString());
        assertThat(o.get("status").asText()).isEqualTo("CREATED");
        assertThat(o.get("subtotalPaise").asLong()).isEqualTo(20000);
        assertThat(o.get("taxPaise").asLong()).isEqualTo(1000);
        assertThat(o.get("deliveryFeePaise").asLong()).isEqualTo(3000);
        assertThat(o.get("totalPaise").asLong()).isEqualTo(24000);
        assertThat(o.get("items")).hasSize(1);
        assertThat(o.has("deliveryOtp")).isFalse();
    }

    @Test
    void tamperedTotalsInBodyHaveNoEffect() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 10000, true);
        String body = """
                {"restaurantId":"%s","totalPaise":1,"subtotalPaise":1,"taxPaise":0,"deliveryFeePaise":0,
                 "lines":[{"itemId":"%s","quantity":2,"unitPricePaise":1,"lineTotalPaise":1}]}
                """.formatted(r, item);
        MvcResult res = createOrder(UUID.randomUUID(), body, null);
        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        JsonNode o = json(res.getResponse().getContentAsString());
        assertThat(o.get("totalPaise").asLong()).isEqualTo(24000);
        assertThat(o.get("items").get(0).get("unitPricePaise").asLong()).isEqualTo(10000);
    }

    @Test
    void unavailableItemYields409WithItemIds() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 500, false);
        mvc.perform(post("/orders").with(customer(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
                        .content(orderBody(r, item, 1)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.itemIds[0]").value(item.toString()));
    }

    @Test
    void closedRestaurantYields409() throws Exception {
        UUID r = seedRestaurant(false);
        UUID item = seedItem(r, 500, true);
        mvc.perform(post("/orders").with(customer(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
                        .content(orderBody(r, item, 1)))
                .andExpect(status().isConflict());
    }

    @Test
    void quantityAbove20Yields400() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 500, true);
        mvc.perform(post("/orders").with(customer(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
                        .content(orderBody(r, item, 21)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/orders")).andExpect(status().isUnauthorized());
    }

    @Test
    void anotherCustomersOrderIsForbidden() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 1000, true);
        UUID owner = UUID.randomUUID();
        UUID intruder = UUID.randomUUID();
        JsonNode o = json(createOrder(owner, orderBody(r, item, 1), null).getResponse().getContentAsString());
        String id = o.get("id").asText();

        mvc.perform(get("/orders/" + id).with(customer(owner))).andExpect(status().isOk());
        mvc.perform(get("/orders/" + id).with(customer(intruder))).andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + id + "/cancel").with(customer(intruder)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/orders").with(customer(intruder)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        // order untouched
        mvc.perform(get("/orders/" + id).with(customer(owner)))
                .andExpect(jsonPath("$.status").value("CREATED"));
    }

    @Test
    void customerCannotUseMerchantEndpoints() throws Exception {
        mvc.perform(post("/orders/" + UUID.randomUUID() + "/accept").with(customer(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void idempotencyKeyReplaysTheSameOrder() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 1000, true);
        UUID customer = UUID.randomUUID();
        String key = "key-" + UUID.randomUUID();

        MvcResult first = createOrder(customer, orderBody(r, item, 1), key);
        MvcResult second = createOrder(customer, orderBody(r, item, 1), key);
        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        assertThat(second.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(second.getResponse().getContentAsString()).get("id").asText())
                .isEqualTo(json(first.getResponse().getContentAsString()).get("id").asText());

        mvc.perform(get("/orders").with(customer(customer)))
                .andExpect(jsonPath("$.length()").value(1));

        // the same key from a different customer is a different order
        MvcResult other = createOrder(UUID.randomUUID(), orderBody(r, item, 1), key);
        assertThat(other.getResponse().getStatus()).isEqualTo(201);
        assertThat(json(other.getResponse().getContentAsString()).get("id").asText())
                .isNotEqualTo(json(first.getResponse().getContentAsString()).get("id").asText());
    }

    @Test
    void cancelAndMerchantLifecycleWithOtp() throws Exception {
        UUID merchant = UUID.randomUUID();
        UUID r = seedRestaurant(true, merchant);
        UUID item = seedItem(r, 1000, true);
        UUID customer = UUID.randomUUID();
        String id = json(createOrder(customer, orderBody(r, item, 1), null).getResponse().getContentAsString())
                .get("id").asText();

        // CREATED -> accept is illegal (409)
        mvc.perform(post("/orders/" + id + "/accept").with(staff(merchant, "RESTAURANT")))
                .andExpect(status().isConflict());

        // simulate payment capture directly in the DB-backed state
        jdbc.update("UPDATE orders SET status='PAID', was_paid=true WHERE id=?::uuid", id);

        for (String step : new String[] {"accept", "preparing", "rider-assigned", "picked-up"}) {
            mvc.perform(post("/orders/" + id + "/" + step).with(staff(merchant, "RESTAURANT")))
                    .andExpect(status().isOk());
        }
        // staff view never contains the OTP; the owner sees it while PICKED_UP
        JsonNode view = json(mvc.perform(get("/orders/" + id).with(customer(customer)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String otp = view.get("deliveryOtp").asText();
        assertThat(otp).matches("\\d{4}");

        // customer can no longer cancel
        mvc.perform(post("/orders/" + id + "/cancel").with(customer(customer)))
                .andExpect(status().isConflict());

        String wrong = otp.equals("0000") ? "1111" : "0000";
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/orders/" + id + "/deliver").with(staff(merchant, "RESTAURANT"))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + wrong + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        // limit reached: even the right OTP is now refused
        mvc.perform(post("/orders/" + id + "/deliver").with(staff(merchant, "RESTAURANT"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + otp + "\"}"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void staffCanOnlyTransitionOrdersOfTheirOwnRestaurant() throws Exception {
        UUID ownerA = UUID.randomUUID();
        UUID ownerB = UUID.randomUUID();
        UUID restaurantB = seedRestaurant(true, ownerB);
        UUID itemB = seedItem(restaurantB, 1000, true);
        UUID restaurantNoOwner = seedRestaurant(true); // replica without owner
        UUID itemNoOwner = seedItem(restaurantNoOwner, 1000, true);
        UUID customer = UUID.randomUUID();
        String orderB = json(createOrder(customer, orderBody(restaurantB, itemB, 1), null).getResponse()
                .getContentAsString()).get("id").asText();
        String orderNoOwner = json(createOrder(customer, orderBody(restaurantNoOwner, itemNoOwner, 1), null)
                .getResponse().getContentAsString()).get("id").asText();
        jdbc.update("UPDATE orders SET status='PAID', was_paid=true WHERE id IN (?::uuid, ?::uuid)",
                orderB, orderNoOwner);

        // staff of restaurant A cannot touch restaurant B's order; null-owner restaurant denies RESTAURANT users
        mvc.perform(post("/orders/" + orderB + "/accept").with(staff(ownerA, "RESTAURANT")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + orderB + "/reject").with(staff(ownerA, "RESTAURANT")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + orderB + "/deliver").with(staff(ownerA, "RESTAURANT"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"0000\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + orderNoOwner + "/accept").with(staff(ownerA, "RESTAURANT")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/" + orderNoOwner + "/accept").with(staff(ownerB, "RESTAURANT")))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT status FROM orders WHERE id=?::uuid", String.class, orderB))
                .isEqualTo("PAID");

        // owner and ADMIN succeed
        mvc.perform(post("/orders/" + orderB + "/accept").with(staff(ownerB, "RESTAURANT")))
                .andExpect(status().isOk());
        mvc.perform(post("/orders/" + orderNoOwner + "/accept").with(staff(UUID.randomUUID(), "ADMIN")))
                .andExpect(status().isOk());
        // unknown order stays 404
        mvc.perform(post("/orders/" + UUID.randomUUID() + "/accept").with(staff(ownerA, "RESTAURANT")))
                .andExpect(status().isNotFound());
    }

    @Test
    void correctOtpDelivers() throws Exception {
        UUID r = seedRestaurant(true);
        UUID item = seedItem(r, 1000, true);
        UUID customer = UUID.randomUUID();
        String id = json(createOrder(customer, orderBody(r, item, 1), null).getResponse().getContentAsString())
                .get("id").asText();
        jdbc.update("UPDATE orders SET status='RIDER_ASSIGNED', was_paid=true WHERE id=?::uuid", id);
        mvc.perform(post("/orders/" + id + "/picked-up").with(staff(UUID.randomUUID(), "ADMIN")))
                .andExpect(status().isOk());
        String otp = jdbc.queryForObject("SELECT delivery_otp FROM orders WHERE id=?::uuid", String.class, id);
        mvc.perform(post("/orders/" + id + "/deliver").with(staff(UUID.randomUUID(), "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + otp + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"));
    }
}
