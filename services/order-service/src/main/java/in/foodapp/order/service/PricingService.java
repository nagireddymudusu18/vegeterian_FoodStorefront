package in.foodapp.order.service;

import in.foodapp.order.api.ApiException;
import in.foodapp.order.config.AppProperties;
import in.foodapp.order.persistence.MenuItemReplica;
import in.foodapp.order.persistence.MenuItemReplicaRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.function.Function;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Computes order prices exclusively from the LOCAL menu replica. The caller only supplies item ids and
 * quantities; no client-provided price or total is ever read.
 */
@Service
public class PricingService {

    public static final int MIN_QTY = 1;
    public static final int MAX_QTY = 20;

    public record LineRequest(UUID itemId, int quantity) {
    }

    public record PricedLine(UUID itemId, String name, long unitPricePaise, int quantity, long lineTotalPaise) {
    }

    public record PricedOrder(UUID restaurantId, List<PricedLine> lines, long subtotalPaise, long taxPaise,
                              long deliveryFeePaise, long totalPaise) {
    }

    private final RestaurantReplicaRepository restaurants;
    private final MenuItemReplicaRepository items;
    private final BigDecimal gstPercent;
    private final long deliveryFeePaise;

    @Autowired
    public PricingService(RestaurantReplicaRepository restaurants, MenuItemReplicaRepository items,
                          AppProperties props) {
        this(restaurants, items, props.gstPercent(), props.deliveryFeePaise());
    }

    public PricingService(RestaurantReplicaRepository restaurants, MenuItemReplicaRepository items,
                          BigDecimal gstPercent, long deliveryFeePaise) {
        this.restaurants = restaurants;
        this.items = items;
        this.gstPercent = gstPercent;
        this.deliveryFeePaise = deliveryFeePaise;
    }

    public PricedOrder price(UUID restaurantId, List<LineRequest> requested) {
        if (restaurantId == null || requested == null || requested.isEmpty()) {
            throw ApiException.badRequest("Invalid order", "restaurantId and at least one line are required");
        }

        // merge duplicate item ids, validate quantities
        Map<UUID, Integer> qtyByItem = new LinkedHashMap<>();
        for (LineRequest l : requested) {
            if (l == null || l.itemId() == null) {
                throw ApiException.badRequest("Invalid order", "Every line needs an itemId");
            }
            if (l.quantity() < MIN_QTY || l.quantity() > MAX_QTY) {
                throw ApiException.badRequest("Invalid quantity",
                        "Quantity must be between " + MIN_QTY + " and " + MAX_QTY);
            }
            qtyByItem.merge(l.itemId(), l.quantity(), Integer::sum);
        }
        for (int q : qtyByItem.values()) {
            if (q > MAX_QTY) {
                throw ApiException.badRequest("Invalid quantity",
                        "Total quantity per item must not exceed " + MAX_QTY);
            }
        }

        RestaurantReplica restaurant = restaurants.findById(restaurantId)
                .orElseThrow(() -> ApiException.notFound("Restaurant not found"));
        if (!restaurant.isOpen()) {
            throw ApiException.conflict("Restaurant closed", "The restaurant is currently closed");
        }

        Map<UUID, MenuItemReplica> found = items.findAllById(qtyByItem.keySet()).stream()
                .collect(Collectors.toMap(MenuItemReplica::getItemId, Function.identity()));

        List<UUID> notInRestaurant = new ArrayList<>();
        List<UUID> unavailable = new ArrayList<>();
        for (UUID id : qtyByItem.keySet()) {
            MenuItemReplica item = found.get(id);
            if (item == null || !restaurantId.equals(item.getRestaurantId())) {
                notInRestaurant.add(id);
            } else if (!item.isAvailable()) {
                unavailable.add(id);
            }
        }
        if (!notInRestaurant.isEmpty()) {
            throw ApiException.badRequest("Items not in restaurant",
                    "Some items do not belong to this restaurant").with("itemIds", notInRestaurant);
        }
        if (!unavailable.isEmpty()) {
            throw ApiException.conflict("Items unavailable",
                    "Some items are currently unavailable").with("itemIds", unavailable);
        }

        List<PricedLine> lines = new ArrayList<>();
        long subtotal = 0;
        for (Map.Entry<UUID, Integer> e : qtyByItem.entrySet()) {
            MenuItemReplica item = found.get(e.getKey());
            long lineTotal = Math.multiplyExact(item.getPricePaise(), (long) e.getValue());
            subtotal = Math.addExact(subtotal, lineTotal);
            lines.add(new PricedLine(item.getItemId(), item.getName(), item.getPricePaise(), e.getValue(),
                    lineTotal));
        }
        long tax = BigDecimal.valueOf(subtotal)
                .multiply(gstPercent)
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP)
                .longValueExact();
        long total = Math.addExact(Math.addExact(subtotal, tax), deliveryFeePaise);
        return new PricedOrder(restaurantId, lines, subtotal, tax, deliveryFeePaise, total);
    }
}
