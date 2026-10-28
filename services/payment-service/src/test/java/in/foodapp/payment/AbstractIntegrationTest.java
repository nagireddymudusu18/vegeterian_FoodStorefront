package in.foodapp.payment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * Base class for integration tests: one shared Postgres for the whole test JVM (see TestDatabase; Docker or
 * TEST_DB_URL). Tests must not assume an empty database; assert on ids they create.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class AbstractIntegrationTest {

    public static final String FEED_KEY = "test-feed-key";
    public static final String WEBHOOK_SECRET = "test-webhook-secret";

    static final TestDatabase.Conn DB = TestDatabase.start("payment", false);

    static final String PUBLIC_KEY_PEM;

    static {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair kp = gen.generateKeyPair();
            PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----\n"
                    + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(kp.getPublic().getEncoded())
                    + "\n-----END PUBLIC KEY-----";
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.jwt.public-key-pem", () -> PUBLIC_KEY_PEM);
        r.add("app.internal-feed-key", () -> FEED_KEY);
        r.add("app.razorpay.webhook-secret", () -> WEBHOOK_SECRET);
        r.add("app.gateway", () -> "fake");
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected JdbcTemplate jdbc;

    protected static RequestPostProcessor asCustomer(UUID userId) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(userId.toString()).claim("roles", List.of("CUSTOMER")))
                .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
    }

    protected static RequestPostProcessor asAdmin(UUID userId) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(userId.toString()).claim("roles", List.of("ADMIN")))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    protected int ledgerTxnCount(UUID paymentId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(DISTINCT txn_id) FROM ledger_entries WHERE payment_id = ?",
                Integer.class, paymentId);
        return n == null ? 0 : n;
    }

    protected int outboxCount(String type, UUID aggregateId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM outbox WHERE type = ? AND aggregate_id = ?",
                Integer.class, type, aggregateId);
        return n == null ? 0 : n;
    }

    @Test
    void contextLoads() {
        // fails fast if migrations, JPA validation or wiring are broken
    }
}
