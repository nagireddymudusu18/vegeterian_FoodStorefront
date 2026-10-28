package in.foodapp.catalog.persistence;

import in.foodapp.catalog.domain.KitchenCertificationLevel;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "restaurants")
public class Restaurant {

    @Id
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "fssai_number", nullable = false)
    private String fssaiNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "kitchen_certification_level", nullable = false)
    private KitchenCertificationLevel kitchenCertificationLevel;

    @Column(name = "lat", nullable = false)
    private double lat;

    @Column(name = "lng", nullable = false)
    private double lng;

    @Column(name = "delivery_radius_meters", nullable = false)
    private int deliveryRadiusMeters;

    @Column(name = "open", nullable = false)
    private boolean open;

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "cuisine")
    private String cuisine;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected Restaurant() {
    }

    public Restaurant(UUID id) {
        this.id = id;
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
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getFssaiNumber() { return fssaiNumber; }
    public void setFssaiNumber(String fssaiNumber) { this.fssaiNumber = fssaiNumber; }
    public KitchenCertificationLevel getKitchenCertificationLevel() { return kitchenCertificationLevel; }
    public void setKitchenCertificationLevel(KitchenCertificationLevel level) { this.kitchenCertificationLevel = level; }
    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }
    public double getLng() { return lng; }
    public void setLng(double lng) { this.lng = lng; }
    public int getDeliveryRadiusMeters() { return deliveryRadiusMeters; }
    public void setDeliveryRadiusMeters(int deliveryRadiusMeters) { this.deliveryRadiusMeters = deliveryRadiusMeters; }
    public boolean isOpen() { return open; }
    public void setOpen(boolean open) { this.open = open; }
    public UUID getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(UUID ownerUserId) { this.ownerUserId = ownerUserId; }
    public String getCuisine() { return cuisine; }
    public void setCuisine(String cuisine) { this.cuisine = cuisine; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Long getVersion() { return version; }
}
