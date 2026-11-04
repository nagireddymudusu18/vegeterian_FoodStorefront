package in.foodapp.notification;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Database for integration tests. By default a Testcontainers Postgres (needs Docker). When TEST_DB_URL is set
 * (admin JDBC URL of a running Postgres, e.g. jdbc:postgresql://127.0.0.1:5432/postgres, with TEST_DB_USER and
 * TEST_DB_PASSWORD) a throwaway database is created there instead and dropped when the JVM exits.
 */
public final class TestDatabase {

    public record Conn(String url, String user, String password) {
    }

    private TestDatabase() {
    }

    public static Conn start(String name) {
        String admin = System.getenv("TEST_DB_URL");
        return admin != null && !admin.isBlank() ? external(admin, name) : container(name);
    }

    private static Conn container(String name) {
        PostgreSQLContainer<?> c = new PostgreSQLContainer<>(DockerImageName.parse("postgres:16"))
                .withDatabaseName(name).withUsername(name).withPassword(name);
        c.start();
        return new Conn(c.getJdbcUrl(), c.getUsername(), c.getPassword());
    }

    private static Conn external(String adminUrl, String name) {
        String user = System.getenv().getOrDefault("TEST_DB_USER", "postgres");
        String password = System.getenv().getOrDefault("TEST_DB_PASSWORD", "");
        String db = "test_" + name + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String url = adminUrl.substring(0, adminUrl.lastIndexOf('/') + 1) + db;
        try {
            execute(adminUrl, user, password, "CREATE DATABASE " + db);
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot prepare test database on " + adminUrl, e);
        }
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                execute(adminUrl, user, password, "DROP DATABASE IF EXISTS " + db + " WITH (FORCE)");
            } catch (SQLException ignored) {
                // best effort; the database is named test_* and can be dropped by hand
            }
        }));
        return new Conn(url, user, password);
    }

    private static void execute(String url, String user, String password, String sql) throws SQLException {
        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }
}
