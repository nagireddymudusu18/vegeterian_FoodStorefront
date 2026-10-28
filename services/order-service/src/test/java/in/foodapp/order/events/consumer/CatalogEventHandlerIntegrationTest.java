package in.foodapp.order.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.order.AbstractIntegrationTest;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.persistence.MenuItemReplica;
import in.foodapp.order.persistence.RestaurantReplica;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class CatalogEventHandlerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    CatalogEventHandler handler;

    private FeedEvent ev(long id, String type, UUID aggregate, Map<String, Object> payload) {
        // a plain mapper: the app's non_null inclusion would drop explicit nulls from the payload
        JsonNode node = new ObjectMapper().valueToTree(new LinkedHashMap<>(payload));
        return new FeedEvent(id, type, aggregate, Instant.now(), node);
    }

    private Map<String, Object> itemPayload(UUID item, UUID restaurant, long price, boolean available) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("itemId", item.toString());
        m.put("restaurantId", restaurant.toString());
        m.put("name", "Paneer");
        m.put("pricePaise", price);
        m.put("isPureVeg", true);
        m.put("isVegan", false);
        m.put("isJain", false);
        m.put("available", available);
        return m;
    }

    @Test
    void upsertsRestaurantAndItemsAndIgnoresStaleEvents() {
        UUID r = UUID.randomUUID();
        UUID item = UUID.randomUUID();
        Map<String, Object> rp = new LinkedHashMap<>();
        rp.put("restaurantId", r.toString());
        rp.put("name", "Spice Hub");
        rp.put("lat", 12.97);
        rp.put("lng", 77.59);
        rp.put("open", true);
        rp.put("deliveryRadiusMeters", 5000);
        rp.put("kitchenCertificationLevel", "GOLD");
        rp.put("fssaiNumber", "12345678901234");
        handler.handle(ev(500, "RestaurantUpserted", r, rp));
        RestaurantReplica rr = restaurants.findById(r).orElseThrow();
        assertThat(rr.isOpen()).isTrue();
        assertThat(rr.getSourceEventId()).isEqualTo(500);

        rp.put("open", false);
        handler.handle(ev(400, "RestaurantUpserted", r, rp)); // stale
        assertThat(restaurants.findById(r).orElseThrow().isOpen()).isTrue();
        handler.handle(ev(600, "RestaurantUpserted", r, rp));
        assertThat(restaurants.findById(r).orElseThrow().isOpen()).isFalse();

        handler.handle(ev(510, "MenuItemUpserted", item, itemPayload(item, r, 12000, true)));
        MenuItemReplica m = items.findById(item).orElseThrow();
        assertThat(m.getPricePaise()).isEqualTo(12000);
        assertThat(m.isAvailable()).isTrue();

        handler.handle(ev(520, "MenuItemAvailabilityChanged", item,
                Map.of("itemId", item.toString(), "restaurantId", r.toString(), "available", false)));
        assertThat(items.findById(item).orElseThrow().isAvailable()).isFalse();

        // stale availability flip and stale upsert are ignored
        handler.handle(ev(515, "MenuItemAvailabilityChanged", item,
                Map.of("itemId", item.toString(), "restaurantId", r.toString(), "available", true)));
        handler.handle(ev(505, "MenuItemUpserted", item, itemPayload(item, r, 99, true)));
        MenuItemReplica after = items.findById(item).orElseThrow();
        assertThat(after.isAvailable()).isFalse();
        assertThat(after.getPricePaise()).isEqualTo(12000);
    }

    @Test
    void ownerUserIdIsReplicatedAndToleratedWhenAbsentOrNull() {
        UUID r = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        Map<String, Object> rp = new LinkedHashMap<>();
        rp.put("restaurantId", r.toString());
        rp.put("name", "Owned");
        rp.put("open", true);
        rp.put("deliveryRadiusMeters", 5000);

        handler.handle(ev(800, "RestaurantUpserted", r, rp)); // older event shape: no ownerUserId
        assertThat(restaurants.findById(r).orElseThrow().getOwnerUserId()).isNull();

        rp.put("ownerUserId", owner.toString());
        handler.handle(ev(810, "RestaurantUpserted", r, rp));
        assertThat(restaurants.findById(r).orElseThrow().getOwnerUserId()).isEqualTo(owner);

        rp.remove("ownerUserId"); // absent keeps the known owner
        handler.handle(ev(820, "RestaurantUpserted", r, rp));
        assertThat(restaurants.findById(r).orElseThrow().getOwnerUserId()).isEqualTo(owner);

        rp.put("ownerUserId", null); // explicit null clears it
        handler.handle(ev(830, "RestaurantUpserted", r, rp));
        assertThat(restaurants.findById(r).orElseThrow().getOwnerUserId()).isNull();
    }

    @Test
    void unknownTypesAndAvailabilityForUnknownItemsAreIgnored() {
        UUID item = UUID.randomUUID();
        handler.handle(ev(700, "SomethingNew", item, Map.of("x", 1)));
        handler.handle(ev(701, "MenuItemAvailabilityChanged", item,
                Map.of("itemId", item.toString(), "restaurantId", UUID.randomUUID().toString(),
                        "available", true)));
        assertThat(items.findById(item)).isEmpty();
    }
}
