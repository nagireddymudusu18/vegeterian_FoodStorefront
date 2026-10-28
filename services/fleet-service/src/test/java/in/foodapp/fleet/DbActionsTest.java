package in.foodapp.fleet;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import in.foodapp.fleet.persistence.DbActions;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class DbActionsTest {

    static final TestDatabase.Conn DB = TestDatabase.start("fleet", false);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.feed.order-key", () -> "");
        r.add("spring.datasource.hikari.idle-timeout", () -> "10000");
    }

    @Autowired
    DbActions db;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    DataSource ds;

    @Test
    void actionsRunInTheirOwnTransactionAndTheRestRollsBack() {
        Integer one = db.query(() -> jdbc.queryForObject("select 1", Integer.class));
        assertThat(one).isEqualTo(1);
        try {
            db.run(() -> {
                jdbc.update("insert into feed_cursor(source, last_id) values ('tx-test', 1)");
                throw new IllegalStateException("boom");
            });
        } catch (IllegalStateException expected) {
            // rolled back below
        }
        assertThat(jdbc.queryForObject("select count(*) from feed_cursor where source='tx-test'", Integer.class)).isZero();
    }

    @Test
    void poolKeepsNoStandingConnectionsConfigured() {
        assertThat(((HikariDataSource) ds).getMinimumIdle()).isZero();
    }
}