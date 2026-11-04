package in.foodapp.notification.persistence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The replicas this service keeps from other services' feeds: contacts, order addressing, restaurant owners. */
@Repository
public class ReplicaStore {

    public record Contact(String phoneEnc, String emailEnc) {
    }

    public record OrderRef(UUID orderId, UUID customerId, UUID restaurantId, String orderNumber,
                           String restaurantName, Long totalPaise) {
    }

    public record Owner(UUID ownerUserId, String name) {
    }

    private final JdbcTemplate jdbc;

    public ReplicaStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Merges the given fields; a null one leaves what is stored unchanged. */
    public void upsertContact(UUID userId, String phoneEnc, String emailEnc) {
        jdbc.update("INSERT INTO user_contact(user_id, phone_enc, email_enc) VALUES (?, ?, ?) "
                + "ON CONFLICT (user_id) DO UPDATE SET "
                + "phone_enc = COALESCE(EXCLUDED.phone_enc, user_contact.phone_enc), "
                + "email_enc = COALESCE(EXCLUDED.email_enc, user_contact.email_enc), updated_at = now()",
                userId, phoneEnc, emailEnc);
    }

    public Optional<Contact> contact(UUID userId) {
        return jdbc.query("SELECT phone_enc, email_enc FROM user_contact WHERE user_id = ?",
                (rs, i) -> new Contact(rs.getString("phone_enc"), rs.getString("email_enc")), userId)
                .stream().findFirst();
    }

    public void deleteContact(UUID userId) {
        jdbc.update("DELETE FROM user_contact WHERE user_id = ?", userId);
    }

    /** Keeps what is already known when a later event does not carry a field. */
    public void upsertOrder(UUID orderId, UUID customerId, UUID restaurantId, String orderNumber,
                            String restaurantName, Long totalPaise) {
        jdbc.update("INSERT INTO order_ref(order_id, customer_id, restaurant_id, order_number, restaurant_name, "
                + "total_paise) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (order_id) DO UPDATE SET "
                + "order_number = COALESCE(EXCLUDED.order_number, order_ref.order_number), "
                + "restaurant_name = COALESCE(EXCLUDED.restaurant_name, order_ref.restaurant_name), "
                + "total_paise = COALESCE(EXCLUDED.total_paise, order_ref.total_paise), updated_at = now()",
                orderId, customerId, restaurantId, orderNumber, restaurantName, totalPaise);
    }

    public Optional<OrderRef> order(UUID orderId) {
        return jdbc.query("SELECT order_id, customer_id, restaurant_id, order_number, restaurant_name, total_paise "
                        + "FROM order_ref WHERE order_id = ?",
                (rs, i) -> new OrderRef(rs.getObject("order_id", UUID.class), rs.getObject("customer_id", UUID.class),
                        rs.getObject("restaurant_id", UUID.class), rs.getString("order_number"),
                        rs.getString("restaurant_name"), (Long) rs.getObject("total_paise")), orderId)
                .stream().findFirst();
    }

    public void upsertRestaurant(UUID restaurantId, UUID ownerUserId, String name) {
        jdbc.update("INSERT INTO restaurant_owner(restaurant_id, owner_user_id, name) VALUES (?, ?, ?) "
                + "ON CONFLICT (restaurant_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, "
                + "name = EXCLUDED.name", restaurantId, ownerUserId, name);
    }

    /** Empty when the restaurant is not known yet; an Owner with a null id when it has no owner. */
    public Optional<Owner> restaurant(UUID restaurantId) {
        return jdbc.query("SELECT owner_user_id, name FROM restaurant_owner WHERE restaurant_id = ?",
                (rs, i) -> new Owner(rs.getObject("owner_user_id", UUID.class), rs.getString("name")), restaurantId)
                .stream().findFirst();
    }
}
