package in.foodapp.catalog.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "menu_items")
public class MenuItem {

    @Id
    private UUID id;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "price_paise", nullable = false)
    private long pricePaise;

    @Column(name = "is_pure_veg", nullable = false)
    private boolean pureVeg;

    @Column(name = "is_vegan", nullable = false)
    private boolean vegan;

    @Column(name = "is_jain", nullable = false)
    private boolean jain;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "contains_allergens", nullable = false, columnDefinition = "text[]")
    private List<String> containsAllergens = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "ingredients", nullable = false, columnDefinition = "text[]")
    private List<String> ingredients = new ArrayList<>();

    @Column(name = "available", nullable = false)
    private boolean available;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected MenuItem() {
    }

    public MenuItem(UUID id, UUID restaurantId) {
        this.id = id;
        this.restaurantId = restaurantId;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getRestaurantId() { return restaurantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public long getPricePaise() { return pricePaise; }
    public void setPricePaise(long pricePaise) { this.pricePaise = pricePaise; }
    public boolean isPureVeg() { return pureVeg; }
    public void setPureVeg(boolean pureVeg) { this.pureVeg = pureVeg; }
    public boolean isVegan() { return vegan; }
    public void setVegan(boolean vegan) { this.vegan = vegan; }
    public boolean isJain() { return jain; }
    public void setJain(boolean jain) { this.jain = jain; }
    public List<String> getContainsAllergens() { return containsAllergens; }
    public void setContainsAllergens(List<String> v) { this.containsAllergens = v == null ? new ArrayList<>() : new ArrayList<>(v); }
    public List<String> getIngredients() { return ingredients; }
    public void setIngredients(List<String> v) { this.ingredients = v == null ? new ArrayList<>() : new ArrayList<>(v); }
    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Long getVersion() { return version; }
}
