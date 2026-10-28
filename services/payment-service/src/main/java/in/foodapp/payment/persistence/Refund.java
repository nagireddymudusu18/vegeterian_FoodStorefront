package in.foodapp.payment.persistence;

import in.foodapp.payment.domain.RefundStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refunds")
public class Refund {

    @Id
    private UUID id;

    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RefundStatus status;

    @Column(name = "gateway_ref", length = 128)
    private String gatewayRef;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Refund() {
    }

    public Refund(UUID id, UUID paymentId, long amountPaise, RefundStatus status, String gatewayRef,
                  String idempotencyKey, String requestHash) {
        this.id = id;
        this.paymentId = paymentId;
        this.amountPaise = amountPaise;
        this.status = status;
        this.gatewayRef = gatewayRef;
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPaymentId() { return paymentId; }
    public long getAmountPaise() { return amountPaise; }
    public RefundStatus getStatus() { return status; }
    public String getGatewayRef() { return gatewayRef; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getRequestHash() { return requestHash; }
    public Instant getCreatedAt() { return createdAt; }
}
