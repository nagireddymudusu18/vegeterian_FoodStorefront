package in.foodapp.identity.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "admin_invites")
public class AdminInvite {

    @Id
    private UUID id;

    @Column(name = "email_hash", nullable = false)
    private String emailHash;

    @Column(name = "email_enc", nullable = false)
    private byte[] emailEnc;

    @Column(name = "token_hash", nullable = false)
    private String tokenHash;

    @Column(name = "invited_by", nullable = false)
    private UUID invitedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected AdminInvite() {
    }

    public AdminInvite(UUID id, String emailHash, byte[] emailEnc, String tokenHash, UUID invitedBy,
                       Instant createdAt, Instant expiresAt) {
        this.id = id;
        this.emailHash = emailHash;
        this.emailEnc = emailEnc;
        this.tokenHash = tokenHash;
        this.invitedBy = invitedBy;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() {
        return id;
    }

    public String getEmailHash() {
        return emailHash;
    }

    public byte[] getEmailEnc() {
        return emailEnc;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
