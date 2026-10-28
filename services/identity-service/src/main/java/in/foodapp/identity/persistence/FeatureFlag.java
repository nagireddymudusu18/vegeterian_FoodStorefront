package in.foodapp.identity.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "feature_flags")
public class FeatureFlag {

    @Id
    @Column(name = "flag_key")
    private String key;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected FeatureFlag() {
    }

    public String getKey() {
        return key;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getDescription() {
        return description;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public void set(boolean enabled, UUID by, Instant at) {
        this.enabled = enabled;
        this.updatedBy = by;
        this.updatedAt = at;
    }
}
