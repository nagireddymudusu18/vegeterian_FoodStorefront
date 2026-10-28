package in.foodapp.order.events.consumer;

import static in.foodapp.order.events.consumer.MalformedEventException.bool;
import static in.foodapp.order.events.consumer.MalformedEventException.decimal;
import static in.foodapp.order.events.consumer.MalformedEventException.number;
import static in.foodapp.order.events.consumer.MalformedEventException.optBool;
import static in.foodapp.order.events.consumer.MalformedEventException.optText;
import static in.foodapp.order.events.consumer.MalformedEventException.text;
import static in.foodapp.order.events.consumer.MalformedEventException.uuid;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.persistence.MenuItemReplica;
import in.foodapp.order.persistence.MenuItemReplicaRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Applies catalog-service events to the local replicas. Idempotent; stale events (id <= source_event_id) ignored. */
@Component
public class CatalogEventHandler {

    private static final Logger log = LoggerFactory.getLogger(CatalogEventHandler.class);

    private final RestaurantReplicaRepository restaurants;
    private final MenuItemReplicaRepository items;

    public CatalogEventHandler(RestaurantReplicaRepository restaurants, MenuItemReplicaRepository items) {
        this.restaurants = restaurants;
        this.items = items;
    }

    @Transactional
    public void handle(FeedEvent event) {
        if (event.type() == null) {
            return;
        }
        try {
            switch (event.type()) {
                case "RestaurantUpserted" -> onRestaurantUpserted(event);
                case "MenuItemUpserted" -> onMenuItemUpserted(event);
                case "MenuItemAvailabilityChanged" -> onAvailabilityChanged(event);
                default -> log.debug("Ignoring catalog event type {}", event.type());
            }
        } catch (MalformedEventException e) {
            log.warn("Skipping malformed catalog event id={} type={}: {}", event.id(), event.type(),
                    e.getMessage());
        }
    }

    private void onRestaurantUpserted(FeedEvent event) {
        JsonNode p = event.payload();
        UUID id = uuid(p, "restaurantId");
        String name = text(p, "name");
        double lat = decimal(p, "lat");
        double lng = decimal(p, "lng");
        boolean open = bool(p, "open");
        int radius = (int) number(p, "deliveryRadiusMeters");
        String cert = optText(p, "kitchenCertificationLevel");
        String fssai = optText(p, "fssaiNumber");

        RestaurantReplica existing = restaurants.findById(id).orElse(null);
        if (existing != null && existing.getSourceEventId() >= event.id()) {
            return;
        }
        RestaurantReplica r = existing != null ? existing : new RestaurantReplica(id);
        // ownerUserId: absent (older event) keeps the known owner; explicit null / unparsable clears it (deny)
        UUID owner = p.has("ownerUserId") ? parseOwner(p.get("ownerUserId"), id) : r.getOwnerUserId();
        restaurants.save(r.update(name, lat, lng, open, radius, cert, fssai, owner, event.id()));
    }

    private UUID parseOwner(JsonNode n, UUID restaurantId) {
        if (n == null || n.isNull()) {
            return null;
        }
        try {
            return UUID.fromString(n.asText());
        } catch (IllegalArgumentException e) {
            log.warn("Restaurant {} has an invalid ownerUserId; treating as no owner", restaurantId);
            return null;
        }
    }

    private void onMenuItemUpserted(FeedEvent event) {
        JsonNode p = event.payload();
        UUID itemId = uuid(p, "itemId");
        UUID restaurantId = uuid(p, "restaurantId");
        String name = text(p, "name");
        long price = number(p, "pricePaise");
        boolean pureVeg = optBool(p, "isPureVeg", false);
        boolean vegan = optBool(p, "isVegan", false);
        boolean jain = optBool(p, "isJain", false);
        boolean available = bool(p, "available");

        MenuItemReplica existing = items.findById(itemId).orElse(null);
        if (existing != null && existing.getSourceEventId() >= event.id()) {
            return;
        }
        MenuItemReplica m = existing != null ? existing : new MenuItemReplica(itemId);
        items.save(m.update(restaurantId, name, price, pureVeg, vegan, jain, available, event.id()));
    }

    private void onAvailabilityChanged(FeedEvent event) {
        JsonNode p = event.payload();
        UUID itemId = uuid(p, "itemId");
        boolean available = bool(p, "available");
        MenuItemReplica existing = items.findById(itemId).orElse(null);
        if (existing == null) {
            // item not replicated yet; the later MenuItemUpserted carries its availability
            log.debug("Availability change for unknown item {}", itemId);
            return;
        }
        if (existing.getSourceEventId() >= event.id()) {
            return;
        }
        items.save(existing.updateAvailability(available, event.id()));
    }
}
