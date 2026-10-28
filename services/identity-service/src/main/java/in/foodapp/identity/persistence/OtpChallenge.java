package in.foodapp.identity.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "otp_challenges")
public class OtpChallenge {

    @Id
    private UUID id;

    @Column(name = "phone_hash", nullable = false)
    private String phoneHash;

    @Column(name = "code_hash", nullable = false)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "consumed", nullable = false)
    private boolean consumed;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "request_ip")
    private String requestIp;

    protected OtpChallenge() {
    }

    public OtpChallenge(UUID id, String phoneHash, String codeHash, Instant expiresAt, Instant createdAt,
                        String requestIp) {
        this.id = id;
        this.phoneHash = phoneHash;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
        this.requestIp = requestIp;
    }

    public void incrementAttempts() {
        this.attempts++;
    }

    public UUID getId() {
        return id;
    }

    public String getPhoneHash() {
        return phoneHash;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public boolean isConsumed() {
        return consumed;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getRequestIp() {
        return requestIp;
    }
}
