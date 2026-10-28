package in.foodapp.payment.persistence;

import in.foodapp.payment.domain.PaymentStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payments")
public class Payment {

    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false, length = 3)
    private String currency = "INR";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PaymentStatus status;

    @Column(nullable = false, length = 32)
    private String gateway;

    @Column(name = "gateway_ref", length = 128)
    private String gatewayRef;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected Payment() {
    }

    public Payment(UUID id, UUID orderId, UUID customerId, long amountPaise, String gateway,
                   String idempotencyKey, String requestHash) {
        this.id = id;
        this.orderId = orderId;
        this.customerId = customerId;
        this.amountPaise = amountPaise;
        this.gateway = gateway;
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.status = PaymentStatus.CREATED;
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void markCaptured(String gatewayRef) {
        this.status = PaymentStatus.CAPTURED;
        this.gatewayRef = gatewayRef;
        this.failureReason = null;
        this.updatedAt = Instant.now();
    }

    public void markFailed(String gatewayRef, String reason) {
        this.status = PaymentStatus.FAILED;
        if (gatewayRef != null) {
            this.gatewayRef = gatewayRef;
        }
        this.failureReason = reason;
        this.updatedAt = Instant.now();
    }

    public void markPending(String gatewayRef) {
        this.gatewayRef = gatewayRef;
        this.updatedAt = Instant.now();
    }

    public void markRefunded() {
        this.status = PaymentStatus.REFUNDED;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getOrderId() { return orderId; }
    public UUID getCustomerId() { return customerId; }
    public long getAmountPaise() { return amountPaise; }
    public String getCurrency() { return currency; }
    public PaymentStatus getStatus() { return status; }
    public String getGateway() { return gateway; }
    public String getGatewayRef() { return gatewayRef; }
    public String getFailureReason() { return failureReason; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getRequestHash() { return requestHash; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Long getVersion() { return version; }
}
