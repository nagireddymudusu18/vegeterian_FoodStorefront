package in.foodapp.catalog.persistence;

import in.foodapp.catalog.api.RestaurantView;
import in.foodapp.catalog.domain.Diet;
import in.foodapp.catalog.domain.KitchenCertificationLevel;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Native PostGIS / full-text search. Uses geography ST_DWithin / ST_Distance (metres, spheroidal). */
@Repository
public class RestaurantSearchRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public RestaurantSearchRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<RestaurantView> search(double lat, double lng, double radiusMeters, Diet diet, String q) {
        StringBuilder sql = new StringBuilder("""
                SELECT r.id, r.name, r.fssai_number, r.kitchen_certification_level, r.lat, r.lng,
                       r.delivery_radius_meters, r.open, r.owner_user_id, r.cuisine,
                       ST_Distance(r.geog, p.pt) AS distance_meters
                FROM restaurants r
                CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography AS pt) p
                WHERE r.open
                  AND ST_DWithin(r.geog, p.pt, :radius)
                  AND ST_DWithin(r.geog, p.pt, r.delivery_radius_meters)
                """);
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("lat", lat)
                .addValue("lng", lng)
                .addValue("radius", radiusMeters);

        if (diet != null) {
            // column name comes from the enum, never from user input
            sql.append("  AND EXISTS (SELECT 1 FROM menu_items d WHERE d.restaurant_id = r.id AND d.available AND d.")
                    .append(dietColumn(diet)).append(")\n");
        }
        if (q != null && !q.isBlank()) {
            sql.append("""
                      AND (r.search_vector @@ websearch_to_tsquery('simple', CAST(:q AS text))
                           OR EXISTS (SELECT 1 FROM menu_items s WHERE s.restaurant_id = r.id
                                      AND s.search_vector @@ websearch_to_tsquery('simple', CAST(:q AS text))))
                    """);
            params.addValue("q", q.trim());
        }
        sql.append("ORDER BY distance_meters ASC, r.name ASC");

        return jdbc.query(sql.toString(), params, (rs, n) -> new RestaurantView(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("fssai_number"),
                KitchenCertificationLevel.valueOf(rs.getString("kitchen_certification_level")),
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getInt("delivery_radius_meters"),
                rs.getBoolean("open"),
                rs.getObject("owner_user_id", UUID.class),
                rs.getString("cuisine"),
                Math.round(rs.getDouble("distance_meters") * 10.0) / 10.0,
                null));
    }

    private static String dietColumn(Diet diet) {
        return switch (diet) {
            case PURE_VEG -> "is_pure_veg";
            case VEGAN -> "is_vegan";
            case JAIN -> "is_jain";
        };
    }
}
