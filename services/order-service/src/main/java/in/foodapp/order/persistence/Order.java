package in.foodapp.order.persistence;

import in.foodapp.order.domain.OrderNumbers;
import in.foodapp.order.domain.OrderStatus;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    private UUID id;

    @Column(name = "order_number", nullable = false, updatable = false)
    private String orderNumber;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "restaurant_id", nullable = false)
    private UUID restaurantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OrderStatus status;

    @Column(name = "subtotal_paise", nullable = false)
    private long subtotalPaise;

    @Column(name = "tax_paise", nullable = false)
    private long taxPaise;

    @Column(name = "delivery_fee_paise", nullable = false)
    private long deliveryFeePaise;

    @Column(name = "total_paise", nullable = false)
    private long totalPaise;

    @Column(name = "delivery_otp")
    private String deliveryOtp;

    @Column(name = "rider_user_id")
    private UUID riderUserId;

    @Column(name = "otp_attempts", nullable = false)
    private int otpAttempts;

    @Column(name = "was_paid", nullable = false)
    private boolean wasPaid;

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Version
    private Long version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id ASC")
    private List<OrderItem> items = new ArrayList<>();

    protected Order() {
    }

    public Order(UUID id, UUID customerId, UUID restaurantId, long subtotalPaise, long taxPaise,
                 long deliveryFeePaise, long totalPaise, String idempotencyKey, Instant now) {
        this.id = id;
        this.orderNumber = OrderNumbers.generate();
        this.customerId = customerId;
        this.restaurantId = restaurantId;
        this.status = OrderStatus.CREATED;
        this.subtotalPaise = subtotalPaise;
        this.taxPaise = taxPaise;
        this.deliveryFeePaise = deliveryFeePaise;
        this.totalPaise = totalPaise;
        this.idempotencyKey = idempotencyKey;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void addItem(OrderItem item) {
        item.setOrder(this);
        items.add(item);
    }

    public UUID getId() {
        return id;
    }

    public String getOrderNumber() {
        return orderNumber;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public UUID getRestaurantId() {
        return restaurantId;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    public long getSubtotalPaise() {
        return subtotalPaise;
    }

    public long getTaxPaise() {
        return taxPaise;
    }

    public long getDeliveryFeePaise() {
        return deliveryFeePaise;
    }

    public long getTotalPaise() {
        return totalPaise;
    }

    public String getDeliveryOtp() {
        return deliveryOtp;
    }

    public void setDeliveryOtp(String deliveryOtp) {
        this.deliveryOtp = deliveryOtp;
    }

    public UUID getRiderUserId() {
        return riderUserId;
    }

    public void setRiderUserId(UUID riderUserId) {
        this.riderUserId = riderUserId;
    }

    public int getOtpAttempts() {
        return otpAttempts;
    }

    public void setOtpAttempts(int otpAttempts) {
        this.otpAttempts = otpAttempts;
    }

    public boolean isWasPaid() {
        return wasPaid;
    }

    public void setWasPaid(boolean wasPaid) {
        this.wasPaid = wasPaid;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public Long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<OrderItem> getItems() {
        return items;
    }
}
