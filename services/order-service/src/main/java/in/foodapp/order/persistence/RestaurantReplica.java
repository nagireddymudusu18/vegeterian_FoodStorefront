package in.foodapp.order.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "restaurant_replica")
public class RestaurantReplica {

    @Id
    @Column(name = "restaurant_id")
    private UUID restaurantId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private double lat;

    @Column(nullable = false)
    private double lng;

    @Column(name = "is_open", nullable = false)
    private boolean open;

    @Column(name = "delivery_radius_meters", nullable = false)
    private int deliveryRadiusMeters;

    @Column(name = "kitchen_certification_level")
    private String kitchenCertificationLevel;

    @Column(name = "fssai_number")
    private String fssaiNumber;

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "source_event_id", nullable = false)
    private long sourceEventId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected RestaurantReplica() {
    }

    public RestaurantReplica(UUID restaurantId) {
        this.restaurantId = restaurantId;
    }

    /** Updates everything except the owner, which is left as is (use the overload to set it). */
    public RestaurantReplica update(String name, double lat, double lng, boolean open, int deliveryRadiusMeters,
                                    String kitchenCertificationLevel, String fssaiNumber, long sourceEventId) {
        return update(name, lat, lng, open, deliveryRadiusMeters, kitchenCertificationLevel, fssaiNumber,
                this.ownerUserId, sourceEventId);
    }

    public RestaurantReplica update(String name, double lat, double lng, boolean open, int deliveryRadiusMeters,
                                    String kitchenCertificationLevel, String fssaiNumber, UUID ownerUserId,
                                    long sourceEventId) {
        this.name = name;
        this.lat = lat;
        this.lng = lng;
        this.open = open;
        this.deliveryRadiusMeters = deliveryRadiusMeters;
        this.kitchenCertificationLevel = kitchenCertificationLevel;
        this.fssaiNumber = fssaiNumber;
        this.ownerUserId = ownerUserId;
        this.sourceEventId = sourceEventId;
        this.updatedAt = Instant.now();
        return this;
    }

    public UUID getRestaurantId() {
        return restaurantId;
    }

    /** Owner's user id (JWT sub); null when unknown, in which case no RESTAURANT user is authorized. */
    public UUID getOwnerUserId() {
        return ownerUserId;
    }

    public String getName() {
        return name;
    }

    public boolean isOpen() {
        return open;
    }

    public long getSourceEventId() {
        return sourceEventId;
    }
}
