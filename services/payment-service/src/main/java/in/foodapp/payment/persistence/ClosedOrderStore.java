package in.foodapp.payment.persistence;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Orders that order-service reported as CANCELLED or REJECTED_BY_MERCHANT (see V3 migration). */
@Repository
public class ClosedOrderStore {

    private final JdbcTemplate jdbc;

    public ClosedOrderStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void markClosed(UUID orderId, String status) {
        jdbc.update("INSERT INTO closed_order(order_id, status) VALUES (?, ?) ON CONFLICT (order_id) DO NOTHING",
                orderId, status);
    }

    public boolean isClosed(UUID orderId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM closed_order WHERE order_id = ?", Integer.class, orderId);
        return n != null && n > 0;
    }
}
