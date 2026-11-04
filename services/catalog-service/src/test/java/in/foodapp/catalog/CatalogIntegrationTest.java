package in.foodapp.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(properties = {"app.seed-demo-data=false", "app.internal-feed-key=test-key"})
@AutoConfigureMockMvc
class CatalogIntegrationTest {

    private static final TestDatabase.Conn DB = TestDatabase.start("catalog", true);

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DB::url);
        registry.add("spring.datasource.username", DB::user);
        registry.add("spring.datasource.password", DB::password);
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    in.foodapp.catalog.events.OutboxService outbox;
    @Autowired
    org.springframework.transaction.PlatformTransactionManager txManager;

    @Test
    void outboxRefusesEventsThatBreakTheirContract() {
        var tx = new org.springframework.transaction.support.TransactionTemplate(txManager);
        java.util.UUID id = java.util.UUID.randomUUID();
        // required fields missing
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError.class, () -> tx.executeWithoutResult(
                s -> outbox.publish("MenuItemUpserted", id, java.util.Map.of("itemId", id.toString()))));
        // an event type with no contract
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError.class, () -> tx.executeWithoutResult(
                s -> outbox.publish("NoSuchEvent", id, java.util.Map.of("itemId", id.toString()))));
        // another service's event
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError.class, () -> tx.executeWithoutResult(
                s -> outbox.publish("UserDeleted", id, java.util.Map.of("userId", id.toString()))));
    }

    // ------------------------------------------------------------------ geofence

    /**
     * Metres to degrees of latitude using the WGS84 meridional radius of curvature at the given latitude. For a
     * purely north-south offset the geodesic length equals M * dPhi (error well below 0.1 m at 5 km), which is
     * what PostGIS geography uses (spheroid). We deliberately do NOT assert exactly 5000 m: sub-metre rounding
     * there would make the test flaky. 4990 m / 5010 m leave a 10 m margin, 4900 / 5100 a 100 m margin.
     */
    static double latOffsetDegrees(double latDeg, double meters) {
        double a = 6378137.0;
        double e2 = 0.00669437999014;
        double s = Math.sin(Math.toRadians(latDeg));
        double meridianRadius = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
        return Math.toDegrees(meters / meridianRadius);
    }

    @Test
    void geofenceBoundaryUsesRestaurantDeliveryRadius() throws Exception {
        double lat = 12.9716;
        double lng = 77.5946;
        UUID owner = UUID.randomUUID();
        JsonNode r = createRestaurant(as(owner, "RESTAURANT"), "Boundary Kitchen", lat, lng, 5000, true);
        String id = r.get("id").asText();

        // query radius (10 km) is wider than the delivery radius, so the 5 km delivery radius is the limit
        for (double d : new double[] {100, 4900, 4990}) {
            JsonNode res = search(lat + latOffsetDegrees(lat, d), lng, 10000, null, null);
            JsonNode hit = find(res, id);
            assertThat(hit).as("included at %s m", d).isNotNull();
            assertThat(hit.get("distanceMeters").asDouble()).isCloseTo(d, within(1.0));
        }
        for (double d : new double[] {5010, 5100, 8000}) {
            JsonNode res = search(lat + latOffsetDegrees(lat, d), lng, 10000, null, null);
            assertThat(find(res, id)).as("excluded at %s m", d).isNull();
        }

        // the caller's radiusMeters is an additional limit
        double p = lat + latOffsetDegrees(lat, 3000);
        assertThat(find(search(p, lng, 2900, null, null), id)).isNull();
        assertThat(find(search(p, lng, 3100, null, null), id)).isNotNull();
        // default radius is 5000 m
        mvc.perform(get("/restaurants").param("lat", String.valueOf(p)).param("lng", String.valueOf(lng)))
                .andExpect(status().isOk());
    }

    @Test
    void resultsAreSortedByDistanceAndClosedRestaurantsAreHidden() throws Exception {
        double lat = 28.6139; // Delhi, isolated from the other tests
        double lng = 77.2090;
        UUID owner = UUID.randomUUID();
        RequestPostProcessor auth = as(owner, "RESTAURANT");
        String far = createRestaurant(auth, "Far", lat + latOffsetDegrees(lat, 2000), lng, 5000, true).get("id").asText();
        String near = createRestaurant(auth, "Near", lat + latOffsetDegrees(lat, 500), lng, 5000, true).get("id").asText();
        String closed = createRestaurant(auth, "Closed", lat + latOffsetDegrees(lat, 100), lng, 5000, false).get("id").asText();

        JsonNode res = search(lat, lng, 5000, null, null);
        List<String> ids = ids(res);
        assertThat(ids).containsSubsequence(near, far);
        assertThat(ids).doesNotContain(closed);
    }

    // ---------------------------------------------------------- diet and search

    @Test
    void cuisineIsStoredTrimmedReturnedInSearchAndOptional() throws Exception {
        double lat = 22.5726; // Kolkata, isolated from the other tests
        double lng = 88.3639;
        RequestPostProcessor auth = as(UUID.randomUUID(), "RESTAURANT");
        Map<String, Object> body = restaurantBody("Cuisine Diner", lat, lng, 5000, true);
        body.put("cuisine", "  South Indian ");
        String id = json(mvc.perform(post("/restaurants").with(auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String plain = createRestaurant(auth, "No Cuisine Diner", lat + latOffsetDegrees(lat, 200), lng, 5000, true)
                .get("id").asText();

        JsonNode res = search(lat, lng, 5000, null, null);
        assertThat(find(res, id).get("cuisine").asText()).isEqualTo("South Indian");
        assertThat(find(res, plain).path("cuisine").isMissingNode() || find(res, plain).get("cuisine").isNull()).isTrue();

        body.put("cuisine", "x".repeat(41));
        mvc.perform(post("/restaurants").with(auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void dietAndFullTextFilters() throws Exception {
        double lat = 19.0760; // Mumbai
        double lng = 72.8777;
        RequestPostProcessor auth = as(UUID.randomUUID(), "RESTAURANT");
        String a = createRestaurant(auth, "Alpha Diner", lat, lng, 5000, true).get("id").asText();
        String b = createRestaurant(auth, "Beta Diner", lat + latOffsetDegrees(lat, 300), lng, 5000, true).get("id").asText();

        JsonNode vegan = addItem(auth, a, itemBody("Zorbaleaf Bowl", true, true, false, List.of("tofu", "rice")));
        addItem(auth, b, itemBody("Plain Thali", true, false, false, List.of("paneer", "rice")));

        assertThat(ids(search(lat, lng, 5000, "VEGAN", null))).contains(a).doesNotContain(b);
        assertThat(ids(search(lat, lng, 5000, "PURE_VEG", null))).contains(a, b);
        assertThat(ids(search(lat, lng, 5000, "JAIN", null))).doesNotContain(a, b);
        assertThat(ids(search(lat, lng, 5000, null, "zorbaleaf"))).contains(a).doesNotContain(b);
        assertThat(ids(search(lat, lng, 5000, null, "beta"))).contains(b).doesNotContain(a);

        // "86" the only vegan item: restaurant no longer matches diet=VEGAN
        mvc.perform(patch("/items/" + vegan.get("id").asText() + "/availability").with(auth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"available\":false}"))
                .andExpect(status().isOk());
        assertThat(ids(search(lat, lng, 5000, "VEGAN", null))).doesNotContain(a);

        JsonNode menu = json(mvc.perform(get("/restaurants/" + a + "/menu").param("diet", "VEGAN"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(menu).hasSize(1);
        JsonNode detail = json(mvc.perform(get("/restaurants/" + a)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(detail.get("menu")).hasSize(1);
        assertThat(detail.get("menu").get(0).get("isVegan").asBoolean()).isTrue();
    }

    @Test
    void dietRuleViolationIsUnprocessableProblemJson() throws Exception {
        RequestPostProcessor auth = as(UUID.randomUUID(), "RESTAURANT");
        String id = createRestaurant(auth, "Rules Cafe", 13.0827, 80.2707, 5000, true).get("id").asText();
        mvc.perform(post("/restaurants/" + id + "/items").with(auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(itemBody("Ghee Rice", true, true, false, List.of("ghee")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    // ------------------------------------------------------------ authorization

    @Test
    void onlyOwnerOrAdminMayWrite() throws Exception {
        UUID ownerId = UUID.randomUUID();
        RequestPostProcessor owner = as(ownerId, "RESTAURANT");
        RequestPostProcessor other = as(UUID.randomUUID(), "RESTAURANT");
        RequestPostProcessor admin = as(UUID.randomUUID(), "ADMIN");
        RequestPostProcessor customer = as(UUID.randomUUID(), "CUSTOMER");

        JsonNode r = createRestaurant(owner, "Owned Kitchen", 22.5726, 88.3639, 5000, true);
        String id = r.get("id").asText();
        assertThat(r.get("ownerUserId").asText()).isEqualTo(ownerId.toString());
        String itemId = addItem(owner, id, itemBody("Luchi", true, true, false, List.of("flour"))).get("id").asText();

        String restaurantUpdate = mapper.writeValueAsString(restaurantBody("Renamed", 22.5726, 88.3639, 5000, true));
        String itemUpdate = mapper.writeValueAsString(itemBody("Luchi v2", true, true, false, List.of("flour")));

        // non-owner restaurant account: 403
        mvc.perform(put("/restaurants/" + id).with(other).contentType(MediaType.APPLICATION_JSON).content(restaurantUpdate))
                .andExpect(status().isForbidden());
        mvc.perform(post("/restaurants/" + id + "/items").with(other).contentType(MediaType.APPLICATION_JSON).content(itemUpdate))
                .andExpect(status().isForbidden());
        mvc.perform(put("/items/" + itemId).with(other).contentType(MediaType.APPLICATION_JSON).content(itemUpdate))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/items/" + itemId + "/availability").with(other).contentType(MediaType.APPLICATION_JSON)
                .content("{\"available\":false}")).andExpect(status().isForbidden());

        // wrong role: 403, no token: 401
        mvc.perform(post("/restaurants").with(customer).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(restaurantBody("X", 1, 1, 100, true)))).andExpect(status().isForbidden());
        mvc.perform(post("/restaurants").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(restaurantBody("X", 1, 1, 100, true)))).andExpect(status().isUnauthorized());

        // owner and admin succeed
        mvc.perform(put("/restaurants/" + id).with(owner).contentType(MediaType.APPLICATION_JSON).content(restaurantUpdate))
                .andExpect(status().isOk());
        mvc.perform(put("/items/" + itemId).with(admin).contentType(MediaType.APPLICATION_JSON).content(itemUpdate))
                .andExpect(status().isOk());
        mvc.perform(patch("/items/" + itemId + "/availability").with(admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"available\":false}")).andExpect(status().isOk());
        // public reads need no token
        mvc.perform(get("/restaurants/" + id)).andExpect(status().isOk());
    }

    // --------------------------------------------------------------------- feed

    @Test
    void feedRejectsMissingOrWrongKey() throws Exception {
        mvc.perform(get("/internal/events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/events").header("X-Internal-Key", "nope")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/events").header("X-Internal-Key", "test-key")).andExpect(status().isOk());
    }

    @Test
    void feedPagesByCursorAndCarriesContractPayloads() throws Exception {
        UUID feedOwnerId = UUID.randomUUID();
        RequestPostProcessor auth = as(feedOwnerId, "RESTAURANT");
        String rid = createRestaurant(auth, "Feed Kitchen", 17.3850, 78.4867, 5000, true).get("id").asText();
        String iid = addItem(auth, rid, itemBody("Feed Dosa", true, true, false, List.of("rice"))).get("id").asText();
        mvc.perform(patch("/items/" + iid + "/availability").with(auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"available\":false}")).andExpect(status().isOk());

        JsonNode all = feed(0, 500);
        List<Long> allIds = new ArrayList<>();
        all.get("events").forEach(e -> allIds.add(e.get("id").asLong()));
        assertThat(allIds).hasSizeGreaterThanOrEqualTo(3).isSorted();
        assertThat(all.get("nextCursor").asLong()).isEqualTo(allIds.get(allIds.size() - 1));

        // page through with limit 2
        List<Long> paged = new ArrayList<>();
        long cursor = 0;
        while (true) {
            JsonNode page = feed(cursor, 2);
            JsonNode events = page.get("events");
            assertThat(events.size()).isLessThanOrEqualTo(2);
            if (events.isEmpty()) {
                assertThat(page.get("nextCursor").asLong()).isEqualTo(cursor);
                break;
            }
            events.forEach(e -> paged.add(e.get("id").asLong()));
            cursor = page.get("nextCursor").asLong();
            assertThat(cursor).isEqualTo(events.get(events.size() - 1).get("id").asLong());
        }
        assertThat(paged).isEqualTo(allIds);

        JsonNode events = all.get("events");
        int n = events.size();
        JsonNode restaurantEvt = events.get(n - 3);
        JsonNode itemEvt = events.get(n - 2);
        JsonNode availEvt = events.get(n - 1);
        assertThat(restaurantEvt.get("type").asText()).isEqualTo("RestaurantUpserted");
        assertThat(restaurantEvt.get("aggregateId").asText()).isEqualTo(rid);
        assertThat(restaurantEvt.get("payload").get("restaurantId").asText()).isEqualTo(rid);
        assertThat(restaurantEvt.get("payload").get("deliveryRadiusMeters").asInt()).isEqualTo(5000);
        assertThat(restaurantEvt.get("payload").get("kitchenCertificationLevel").asText()).isEqualTo("TIER_1_EXCLUSIVE_VEG");
        assertThat(restaurantEvt.get("payload").get("ownerUserId").asText()).isEqualTo(feedOwnerId.toString());
        assertThat(itemEvt.get("type").asText()).isEqualTo("MenuItemUpserted");
        assertThat(itemEvt.get("payload").get("pricePaise").asLong()).isEqualTo(10000L);
        assertThat(itemEvt.get("payload").get("isVegan").asBoolean()).isTrue();
        assertThat(availEvt.get("type").asText()).isEqualTo("MenuItemAvailabilityChanged");
        assertThat(availEvt.get("payload").get("itemId").asText()).isEqualTo(iid);
        assertThat(availEvt.get("payload").get("available").asBoolean()).isFalse();
        assertThat(availEvt.get("occurredAt").asText()).endsWith("Z");
    }

    // ------------------------------------------------------------------ helpers

    private JsonNode feed(long after, int limit) throws Exception {
        return json(mvc.perform(get("/internal/events").header("X-Internal-Key", "test-key")
                        .param("after", String.valueOf(after)).param("limit", String.valueOf(limit)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private static RequestPostProcessor as(UUID user, String... roles) {
        List<GrantedAuthority> authorities = new ArrayList<>();
        for (String role : roles) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
        }
        return jwt().jwt(j -> j.subject(user.toString()).claim("roles", List.of(roles))).authorities(authorities);
    }

    private Map<String, Object> restaurantBody(String name, double lat, double lng, int radius, boolean open) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("fssaiNumber", "12345678901234");
        body.put("kitchenCertificationLevel", "TIER_1_EXCLUSIVE_VEG");
        body.put("lat", lat);
        body.put("lng", lng);
        body.put("deliveryRadiusMeters", radius);
        body.put("open", open);
        return body;
    }

    private Map<String, Object> itemBody(String name, boolean pureVeg, boolean vegan, boolean jain,
                                         List<String> ingredients) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("description", "test item");
        body.put("pricePaise", 10000);
        body.put("isPureVeg", pureVeg);
        body.put("isVegan", vegan);
        body.put("isJain", jain);
        body.put("ingredients", ingredients);
        body.put("containsAllergens", List.of());
        body.put("available", true);
        return body;
    }

    private JsonNode createRestaurant(RequestPostProcessor auth, String name, double lat, double lng, int radius,
                                      boolean open) throws Exception {
        return json(mvc.perform(post("/restaurants").with(auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(restaurantBody(name, lat, lng, radius, open))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode addItem(RequestPostProcessor auth, String restaurantId, Map<String, Object> body) throws Exception {
        return json(mvc.perform(post("/restaurants/" + restaurantId + "/items").with(auth)
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode search(double lat, double lng, int radius, String diet, String q) throws Exception {
        var req = get("/restaurants").param("lat", String.valueOf(lat)).param("lng", String.valueOf(lng))
                .param("radiusMeters", String.valueOf(radius));
        if (diet != null) {
            req = req.param("diet", diet);
        }
        if (q != null) {
            req = req.param("q", q);
        }
        return json(mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode json(String s) throws Exception {
        return mapper.readTree(s);
    }

    private static List<String> ids(JsonNode array) {
        List<String> out = new ArrayList<>();
        array.forEach(n -> out.add(n.get("id").asText()));
        return out;
    }

    private static JsonNode find(JsonNode array, String id) {
        for (JsonNode n : array) {
            if (id.equals(n.get("id").asText())) {
                return n;
            }
        }
        return null;
    }
}
