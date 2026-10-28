package in.foodapp.order;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.order.persistence.MenuItemReplica;
import in.foodapp.order.persistence.MenuItemReplicaRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Shared base: one Postgres for the whole test JVM (see TestDatabase), MockMvc with the real security chain. */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class AbstractIntegrationTest {

    public static final String FEED_KEY = "test-feed-key";

    static final TestDatabase.Conn DB = TestDatabase.start("order", false);

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DB::url);
        registry.add("spring.datasource.username", DB::user);
        registry.add("spring.datasource.password", DB::password);
        registry.add("app.internal-feed-key", () -> FEED_KEY);
        // pollers stay disabled: blank keys
        registry.add("app.feed.catalog-key", () -> "");
        registry.add("app.feed.payment-key", () -> "");
        registry.add("app.feed.fleet-key", () -> "");
    }

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected ObjectMapper om;
    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected RestaurantReplicaRepository restaurants;
    @Autowired
    protected MenuItemReplicaRepository items;

    protected UUID seedRestaurant(boolean open) {
        return seedRestaurant(open, null);
    }

    protected UUID seedRestaurant(boolean open, UUID ownerUserId) {
        UUID id = UUID.randomUUID();
        restaurants.save(new RestaurantReplica(id).update("Test Kitchen", 12.9, 77.6, open, 5000, "GOLD",
                "FSSAI123", ownerUserId, 1));
        return id;
    }

    protected UUID seedItem(UUID restaurantId, long pricePaise, boolean available) {
        UUID id = UUID.randomUUID();
        items.save(new MenuItemReplica(id).update(restaurantId, "Dish " + pricePaise, pricePaise, true, false,
                false, available, 1));
        return id;
    }

    protected static JwtRequestPostProcessor customer(UUID userId) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(userId.toString()).claim("roles", java.util.List.of("CUSTOMER")))
                .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
    }

    protected static JwtRequestPostProcessor staff(UUID userId, String role) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(userId.toString()).claim("roles", java.util.List.of(role)))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }

    protected static String orderBody(UUID restaurantId, UUID itemId, int quantity) {
        return """
                {"restaurantId":"%s","lines":[{"itemId":"%s","quantity":%d}]}
                """.formatted(restaurantId, itemId, quantity);
    }

    protected JsonNode json(String body) throws Exception {
        return om.readTree(body);
    }
}
