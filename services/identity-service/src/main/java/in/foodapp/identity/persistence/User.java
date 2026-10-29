package in.foodapp.identity.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "users")
public class User {

    public static final String ACTIVE = "ACTIVE";
    public static final String DELETED = "DELETED";

    @Id
    private UUID id;

    @Column(name = "phone_enc")
    private byte[] phoneEnc;

    @Column(name = "phone_hash")
    private String phoneHash;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "roles", columnDefinition = "text[]", nullable = false)
    private String[] roles;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "name_enc")
    private byte[] nameEnc;

    @Column(name = "email_enc")
    private byte[] emailEnc;

    @Column(name = "email_hash")
    private String emailHash;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "failed_logins", nullable = false)
    private int failedLogins;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    protected User() {
    }

    public User(UUID id, byte[] phoneEnc, String phoneHash, String[] roles, Instant createdAt) {
        this.id = id;
        this.phoneEnc = phoneEnc;
        this.phoneHash = phoneHash;
        this.roles = roles;
        this.status = ACTIVE;
        this.createdAt = createdAt;
    }

    public boolean isActive() {
        return ACTIVE.equals(status);
    }

    public void markDeleted(Instant at) {
        this.status = DELETED;
        this.deletedAt = at;
        this.phoneEnc = null;
        this.phoneHash = null;
        this.nameEnc = null;
        this.emailEnc = null;
        this.emailHash = null;
        this.passwordHash = null;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** Records a failed password attempt; locks the account once {@code maxFailures} is reached. */
    public void recordFailedLogin(Instant now, int maxFailures, java.time.Duration lockFor) {
        failedLogins++;
        if (failedLogins >= maxFailures) {
            lockedUntil = now.plus(lockFor);
            failedLogins = 0;
        }
    }

    public void recordSuccessfulLogin() {
        failedLogins = 0;
        lockedUntil = null;
    }

    public void setName(byte[] nameEnc) {
        this.nameEnc = nameEnc;
    }

    public void setCredentials(byte[] emailEnc, String emailHash, String passwordHash) {
        this.emailEnc = emailEnc;
        this.emailHash = emailHash;
        this.passwordHash = passwordHash;
        this.emailVerified = false;
    }

    public void clearEmail() {
        this.emailEnc = null;
        this.emailHash = null;
        this.passwordHash = null;
        this.emailVerified = false;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public void markEmailVerified() {
        this.emailVerified = true;
    }

    public void setPhone(byte[] phoneEnc, String phoneHash) {
        this.phoneEnc = phoneEnc;
        this.phoneHash = phoneHash;
    }

    public byte[] getNameEnc() {
        return nameEnc;
    }

    public byte[] getEmailEnc() {
        return emailEnc;
    }

    public String getEmailHash() {
        return emailHash;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public UUID getId() {
        return id;
    }

    public byte[] getPhoneEnc() {
        return phoneEnc;
    }

    public String getPhoneHash() {
        return phoneHash;
    }

    public void addRole(String role) {
        if (java.util.Arrays.asList(roles).contains(role)) {
            return;
        }
        String[] next = java.util.Arrays.copyOf(roles, roles.length + 1);
        next[roles.length] = role;
        roles = next;
    }

    public void removeRole(String role) {
        roles = java.util.Arrays.stream(roles).filter(r -> !r.equals(role)).toArray(String[]::new);
    }

    public String[] getRoles() {
        return roles;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
