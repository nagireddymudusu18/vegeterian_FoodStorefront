package in.foodapp.order.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "item_id", nullable = false)
    private UUID itemId;

    @Column(nullable = false)
    private String name;

    @Column(name = "unit_price_paise", nullable = false)
    private long unitPricePaise;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "line_total_paise", nullable = false)
    private long lineTotalPaise;

    protected OrderItem() {
    }

    public OrderItem(UUID itemId, String name, long unitPricePaise, int quantity, long lineTotalPaise) {
        this.itemId = itemId;
        this.name = name;
        this.unitPricePaise = unitPricePaise;
        this.quantity = quantity;
        this.lineTotalPaise = lineTotalPaise;
    }

    void setOrder(Order order) {
        this.order = order;
    }

    public UUID getItemId() {
        return itemId;
    }

    public String getName() {
        return name;
    }

    public long getUnitPricePaise() {
        return unitPricePaise;
    }

    public int getQuantity() {
        return quantity;
    }

    public long getLineTotalPaise() {
        return lineTotalPaise;
    }
}
