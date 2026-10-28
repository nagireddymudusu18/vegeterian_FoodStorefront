package in.foodapp.catalog.service;

import in.foodapp.catalog.api.MenuItemRequest;
import in.foodapp.catalog.api.MenuItemView;
import in.foodapp.catalog.api.RestaurantRequest;
import in.foodapp.catalog.api.RestaurantView;
import in.foodapp.catalog.domain.Diet;
import in.foodapp.catalog.domain.DietRules;
import in.foodapp.catalog.domain.ForbiddenException;
import in.foodapp.catalog.domain.ResourceNotFoundException;
import in.foodapp.catalog.events.OutboxService;
import in.foodapp.catalog.persistence.MenuItem;
import in.foodapp.catalog.persistence.MenuItemRepository;
import in.foodapp.catalog.persistence.Restaurant;
import in.foodapp.catalog.persistence.RestaurantRepository;
import in.foodapp.catalog.persistence.RestaurantSearchRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

    public static final int DEFAULT_RADIUS_METERS = 5000;

    private final RestaurantRepository restaurants;
    private final MenuItemRepository items;
    private final RestaurantSearchRepository search;
    private final OutboxService outbox;

    public CatalogService(RestaurantRepository restaurants, MenuItemRepository items,
                          RestaurantSearchRepository search, OutboxService outbox) {
        this.restaurants = restaurants;
        this.items = items;
        this.search = search;
        this.outbox = outbox;
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public List<RestaurantView> searchRestaurants(double lat, double lng, Integer radiusMeters, Diet diet, String q) {
        int radius = radiusMeters == null ? DEFAULT_RADIUS_METERS : radiusMeters;
        return search.search(lat, lng, radius, diet, q);
    }

    @Transactional(readOnly = true)
    public RestaurantView getRestaurant(UUID id) {
        Restaurant r = requireRestaurant(id);
        return RestaurantView.of(r, menuOf(id, null));
    }

    @Transactional(readOnly = true)
    public List<MenuItemView> getMenu(UUID restaurantId, Diet diet) {
        requireRestaurant(restaurantId);
        return menuOf(restaurantId, diet);
    }

    private List<MenuItemView> menuOf(UUID restaurantId, Diet diet) {
        return items.findByRestaurantIdOrderByNameAsc(restaurantId).stream()
                .filter(i -> diet == null || matches(i, diet))
                .map(MenuItemView::of)
                .toList();
    }

    private static boolean matches(MenuItem i, Diet diet) {
        return switch (diet) {
            case PURE_VEG -> i.isPureVeg();
            case VEGAN -> i.isVegan();
            case JAIN -> i.isJain();
        };
    }

    // --------------------------------------------------------------- writes

    @Transactional
    public RestaurantView createRestaurant(RestaurantRequest req, Caller caller) {
        Restaurant r = new Restaurant(UUID.randomUUID());
        r.setOwnerUserId(caller.admin() && req.ownerUserId() != null ? req.ownerUserId() : caller.userId());
        apply(r, req);
        restaurants.save(r);
        publishRestaurant(r);
        return RestaurantView.of(r, List.of());
    }

    @Transactional
    public RestaurantView updateRestaurant(UUID id, RestaurantRequest req, Caller caller) {
        Restaurant r = requireRestaurant(id);
        authorize(r, caller);
        if (caller.admin() && req.ownerUserId() != null) {
            r.setOwnerUserId(req.ownerUserId());
        }
        apply(r, req);
        restaurants.save(r);
        publishRestaurant(r);
        return RestaurantView.of(r, menuOf(id, null));
    }

    @Transactional
    public MenuItemView addItem(UUID restaurantId, MenuItemRequest req, Caller caller) {
        Restaurant r = requireRestaurant(restaurantId);
        authorize(r, caller);
        MenuItem item = new MenuItem(UUID.randomUUID(), restaurantId);
        applyItem(item, req);
        items.save(item);
        publishItem(item);
        return MenuItemView.of(item);
    }

    @Transactional
    public MenuItemView updateItem(UUID itemId, MenuItemRequest req, Caller caller) {
        MenuItem item = requireItem(itemId);
        authorize(requireRestaurant(item.getRestaurantId()), caller);
        applyItem(item, req);
        items.save(item);
        publishItem(item);
        return MenuItemView.of(item);
    }

    /** The "86" toggle. */
    @Transactional
    public MenuItemView setAvailability(UUID itemId, boolean available, Caller caller) {
        MenuItem item = requireItem(itemId);
        authorize(requireRestaurant(item.getRestaurantId()), caller);
        item.setAvailable(available);
        items.save(item);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("itemId", item.getId());
        payload.put("restaurantId", item.getRestaurantId());
        payload.put("available", item.isAvailable());
        outbox.publish("MenuItemAvailabilityChanged", item.getId(), payload);
        return MenuItemView.of(item);
    }

    // -------------------------------------------------------------- helpers

    private void apply(Restaurant r, RestaurantRequest req) {
        r.setName(req.name().trim());
        r.setFssaiNumber(req.fssaiNumber().trim());
        r.setKitchenCertificationLevel(req.kitchenCertificationLevel());
        r.setLat(req.lat());
        r.setLng(req.lng());
        r.setDeliveryRadiusMeters(req.deliveryRadiusMeters());
        r.setOpen(req.open() == null || req.open());
        String cuisine = req.cuisine() == null ? "" : req.cuisine().trim();
        r.setCuisine(cuisine.isEmpty() ? null : cuisine);
    }

    private void applyItem(MenuItem item, MenuItemRequest req) {
        boolean pureVeg = Boolean.TRUE.equals(req.isPureVeg());
        boolean vegan = Boolean.TRUE.equals(req.isVegan());
        boolean jain = Boolean.TRUE.equals(req.isJain());
        List<String> ingredients = req.ingredients() == null ? List.of() : req.ingredients();
        DietRules.validate(pureVeg, vegan, jain, ingredients);

        item.setName(req.name().trim());
        item.setDescription(req.description());
        item.setPricePaise(req.pricePaise());
        item.setPureVeg(pureVeg);
        item.setVegan(vegan);
        item.setJain(jain);
        item.setContainsAllergens(req.containsAllergens());
        item.setIngredients(ingredients);
        item.setAvailable(req.available() == null || req.available());
    }

    private void authorize(Restaurant r, Caller caller) {
        if (caller.admin()) {
            return;
        }
        if (r.getOwnerUserId() == null || !Objects.equals(r.getOwnerUserId(), caller.userId())) {
            throw new ForbiddenException("You do not own this restaurant");
        }
    }

    private Restaurant requireRestaurant(UUID id) {
        return restaurants.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found: " + id));
    }

    private MenuItem requireItem(UUID id) {
        return items.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Menu item not found: " + id));
    }

    private void publishRestaurant(Restaurant r) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("restaurantId", r.getId());
        p.put("name", r.getName());
        p.put("lat", r.getLat());
        p.put("lng", r.getLng());
        p.put("open", r.isOpen());
        p.put("deliveryRadiusMeters", r.getDeliveryRadiusMeters());
        p.put("kitchenCertificationLevel", r.getKitchenCertificationLevel().name());
        p.put("fssaiNumber", r.getFssaiNumber());
        // nullable; consumers (order-service) use it to authorize restaurant staff
        p.put("ownerUserId", r.getOwnerUserId());
        outbox.publish("RestaurantUpserted", r.getId(), p);
    }

    private void publishItem(MenuItem i) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("itemId", i.getId());
        p.put("restaurantId", i.getRestaurantId());
        p.put("name", i.getName());
        p.put("pricePaise", i.getPricePaise());
        p.put("isPureVeg", i.isPureVeg());
        p.put("isVegan", i.isVegan());
        p.put("isJain", i.isJain());
        p.put("available", i.isAvailable());
        outbox.publish("MenuItemUpserted", i.getId(), p);
    }
}
