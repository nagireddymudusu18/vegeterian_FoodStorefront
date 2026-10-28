package in.foodapp.order.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "menu_item_replica")
public class MenuItemReplica {

    @Id
    @Column(name = "item_id")
    private UUID itemId;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(nullable = false)
    private String name;

    @Column(name = "price_paise", nullable = false)
    private long pricePaise;

    @Column(name = "is_pure_veg", nullable = false)
    private boolean pureVeg;

    @Column(name = "is_vegan", nullable = false)
    private boolean vegan;

    @Column(name = "is_jain", nullable = false)
    private boolean jain;

    @Column(nullable = false)
    private boolean available;

    @Column(name = "source_event_id", nullable = false)
    private long sourceEventId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected MenuItemReplica() {
    }

    public MenuItemReplica(UUID itemId) {
        this.itemId = itemId;
    }

    public MenuItemReplica update(UUID restaurantId, String name, long pricePaise, boolean pureVeg, boolean vegan,
                                  boolean jain, boolean available, long sourceEventId) {
        this.restaurantId = restaurantId;
        this.name = name;
        this.pricePaise = pricePaise;
        this.pureVeg = pureVeg;
        this.vegan = vegan;
        this.jain = jain;
        this.available = available;
        this.sourceEventId = sourceEventId;
        this.updatedAt = Instant.now();
        return this;
    }

    public MenuItemReplica updateAvailability(boolean available, long sourceEventId) {
        this.available = available;
        this.sourceEventId = sourceEventId;
        this.updatedAt = Instant.now();
        return this;
    }

    public UUID getItemId() {
        return itemId;
    }

    public UUID getRestaurantId() {
        return restaurantId;
    }

    public String getName() {
        return name;
    }

    public long getPricePaise() {
        return pricePaise;
    }

    public boolean isAvailable() {
        return available;
    }

    public long getSourceEventId() {
        return sourceEventId;
    }
}
