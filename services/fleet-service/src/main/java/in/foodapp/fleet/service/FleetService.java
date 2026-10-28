package in.foodapp.fleet.service;

import in.foodapp.fleet.api.ApiException;
import in.foodapp.fleet.api.Views.DeliveryView;
import in.foodapp.fleet.api.Views.PartnerView;
import in.foodapp.fleet.config.AppProperties;
import in.foodapp.fleet.events.outbox.OutboxService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import in.foodapp.fleet.events.stream.FleetChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Partners and delivery jobs. A job is AVAILABLE (in the pool) until exactly one partner claims it; the claim is a
 * single conditional UPDATE so two partners can never take the same order. Every assignment is announced to
 * order-service through the outbox (DeliveryAssigned); later states are mirrored back from the order feed.
 */
@Service
public class FleetService {

    private static final String ACTIVE = "('ASSIGNED', 'PICKED_UP')";

    private static final RowMapper<DeliveryView> DELIVERY = (rs, i) -> new DeliveryView(
            rs.getObject("order_id", UUID.class), rs.getString("order_number"), rs.getString("restaurant_name"),
            rs.getString("status"), rs.getObject("partner_id", UUID.class),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant());

    private final JdbcTemplate jdbc;
    private final OutboxService outbox;
    private final int maxActive;
    private final ApplicationEventPublisher events;

    public FleetService(JdbcTemplate jdbc, OutboxService outbox, AppProperties props,
                        ApplicationEventPublisher events) {
        this.events = events;
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.maxActive = props.maxActiveDeliveries() <= 0 ? 2 : props.maxActiveDeliveries();
    }

    // ---------------------------------------------------------------- partner profile

    @Transactional
    public PartnerView register(UUID userId, String name, String vehicle) {
        jdbc.update("INSERT INTO partners(user_id, name, vehicle) VALUES (?, ?, ?) "
                + "ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, vehicle = EXCLUDED.vehicle",
                userId, name.trim(), vehicle.trim());
        events.publishEvent(new FleetChangedEvent());
        return me(userId);
    }

    @Transactional(readOnly = true)
    public PartnerView me(UUID userId) {
        return partner(userId, "Complete your partner profile first");
    }

    @Transactional
    public PartnerView setOnline(UUID userId, boolean online) {
        if (jdbc.update("UPDATE partners SET online = ? WHERE user_id = ?", online, userId) == 0) {
            throw ApiException.notFound("Complete your partner profile first");
        }
        events.publishEvent(new FleetChangedEvent());
        return me(userId);
    }

    // ---------------------------------------------------------------- pool and claims

    @Transactional(readOnly = true)
    public List<DeliveryView> pool(UUID userId) {
        PartnerView p = me(userId);
        if (!p.online()) {
            throw ApiException.conflict("Offline", "Go online to see available deliveries");
        }
        return jdbc.query("SELECT * FROM deliveries WHERE status = 'AVAILABLE' ORDER BY created_at LIMIT 50",
                DELIVERY);
    }

    @Transactional(readOnly = true)
    public List<DeliveryView> mine(UUID userId) {
        return jdbc.query("SELECT * FROM deliveries WHERE partner_id = ? AND status IN " + ACTIVE
                + " ORDER BY created_at", DELIVERY, userId);
    }

    @Transactional
    public DeliveryView accept(UUID userId, UUID orderId) {
        // lock the partner row so two simultaneous accepts cannot exceed the active limit
        List<Boolean> online = jdbc.query("SELECT online FROM partners WHERE user_id = ? FOR UPDATE",
                (rs, i) -> rs.getBoolean(1), userId);
        if (online.isEmpty()) {
            throw ApiException.notFound("Complete your partner profile first");
        }
        if (!online.get(0)) {
            throw ApiException.conflict("Offline", "Go online to accept deliveries");
        }
        Integer active = jdbc.queryForObject("SELECT count(*) FROM deliveries WHERE partner_id = ? AND status IN "
                + ACTIVE, Integer.class, userId);
        if (active != null && active >= maxActive) {
            throw ApiException.conflict("Too many deliveries",
                    "Finish your current deliveries before accepting more (limit " + maxActive + ")");
        }
        return claim(orderId, userId, "PARTNER");
    }

    @Transactional
    public DeliveryView adminAssign(UUID orderId, UUID partnerId) {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM partners WHERE user_id = ?", Integer.class,
                partnerId);
        if (exists == null || exists == 0) {
            throw ApiException.notFound("Partner not found");
        }
        return claim(orderId, partnerId, "ADMIN");
    }

    private DeliveryView claim(UUID orderId, UUID partnerId, String by) {
        int n = jdbc.update("UPDATE deliveries SET status = 'ASSIGNED', partner_id = ?, assigned_at = now(), "
                + "updated_at = now() WHERE order_id = ? AND status = 'AVAILABLE'", partnerId, orderId);
        if (n == 0) {
            Integer known = jdbc.queryForObject("SELECT count(*) FROM deliveries WHERE order_id = ?",
                    Integer.class, orderId);
            if (known == null || known == 0) {
                throw ApiException.notFound("Delivery not found");
            }
            throw ApiException.conflict("Unavailable", "This delivery was already taken or is no longer open");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", orderId.toString());
        payload.put("partnerId", partnerId.toString());
        payload.put("assignedBy", by);
        outbox.append("DeliveryAssigned", orderId, payload);
        events.publishEvent(new FleetChangedEvent());
        return jdbc.queryForObject("SELECT * FROM deliveries WHERE order_id = ?", DELIVERY, orderId);
    }

    // ---------------------------------------------------------------- admin

    @Transactional(readOnly = true)
    public List<DeliveryView> adminDeliveries(String status) {
        if (status == null || status.isBlank()) {
            return jdbc.query("SELECT * FROM deliveries ORDER BY created_at DESC LIMIT 200", DELIVERY);
        }
        return jdbc.query("SELECT * FROM deliveries WHERE status = ? ORDER BY created_at DESC LIMIT 200",
                DELIVERY, status.toUpperCase());
    }

    @Transactional(readOnly = true)
    public List<PartnerView> adminPartners() {
        return jdbc.query(PARTNER_SQL + " ORDER BY p.created_at DESC LIMIT 200", PARTNER);
    }

    // ---------------------------------------------------------------- helpers

    private static final String PARTNER_SQL = "SELECT p.user_id, p.name, p.vehicle, p.online, "
            + "(SELECT count(*) FROM deliveries d WHERE d.partner_id = p.user_id AND d.status IN " + ACTIVE
            + ") AS active FROM partners p";

    private static final RowMapper<PartnerView> PARTNER = (rs, i) -> new PartnerView(
            rs.getObject("user_id", UUID.class), rs.getString("name"), rs.getString("vehicle"),
            rs.getBoolean("online"), rs.getInt("active"));

    private PartnerView partner(UUID userId, String missing) {
        List<PartnerView> rows = jdbc.query(PARTNER_SQL + " WHERE p.user_id = ?", PARTNER, userId);
        if (rows.isEmpty()) {
            throw ApiException.notFound(missing);
        }
        return rows.get(0);
    }
}