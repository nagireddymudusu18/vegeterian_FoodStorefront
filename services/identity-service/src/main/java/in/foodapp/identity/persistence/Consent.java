package in.foodapp.identity.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "consents")
public class Consent {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "purpose", nullable = false)
    private String purpose;

    @Column(name = "version", nullable = false)
    private String version;

    @Column(name = "granted", nullable = false)
    private boolean granted;

    @Column(name = "at", nullable = false)
    private Instant at;

    @Column(name = "ip")
    private String ip;

    protected Consent() {
    }

    public Consent(UUID id, UUID userId, String purpose, String version, boolean granted, Instant at, String ip) {
        this.id = id;
        this.userId = userId;
        this.purpose = purpose;
        this.version = version;
        this.granted = granted;
        this.at = at;
        this.ip = ip;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPurpose() {
        return purpose;
    }

    public String getVersion() {
        return version;
    }

    public boolean isGranted() {
        return granted;
    }

    public Instant getAt() {
        return at;
    }

    public String getIp() {
        return ip;
    }
}
