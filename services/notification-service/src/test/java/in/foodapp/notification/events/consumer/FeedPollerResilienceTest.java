package in.foodapp.notification.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.notification.TestDatabase;
import in.foodapp.notification.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.notification.events.consumer.FeedDtos.FeedPage;
import in.foodapp.notification.persistence.FeedCursorStore;
import in.foodapp.notification.persistence.FeedFailureStore;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

/** A bad event must not block a feed: it is retried, then parked, and the events after it still get applied. */
@SpringBootTest
class FeedPollerResilienceTest {

    static final TestDatabase.Conn DB = TestDatabase.start("notification");
    private static final int MAX_ATTEMPTS = 3;
    private static final long BASE = 20_000_000L;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.contact-event-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
        r.add("app.feed.identity-key", () -> "");
        r.add("app.feed.catalog-key", () -> "");
        r.add("app.feed.order-key", () -> "");
        r.add("app.feed.payment-key", () -> "");
        r.add("app.feed.fleet-key", () -> "");
        r.add("NOTIFY_DISPATCH_MS", () -> "3600000");
    }

    @Autowired
    FeedCursorStore cursors;
    @Autowired
    FeedFailureStore failures;
    @Autowired
    TransactionTemplate tx;
    @Autowired
    JdbcTemplate jdbc;

    private final ObjectMapper om = new ObjectMapper();

    /** A producer that serves a fixed list of events, honouring the cursor and the limit. */
    static class FixedFeed extends FeedClient {
        private final List<FeedEvent> events;

        FixedFeed(List<FeedEvent> events) {
            super(RestClient.builder());
            this.events = events;
        }

        @Override
        public FeedPage fetch(String baseUrl, String key, long after, int limit) {
            List<FeedEvent> page = events.stream().filter(e -> e.id() > after).limit(limit).toList();
            return new FeedPage(page, page.isEmpty() ? after : page.get(page.size() - 1).id());
        }
    }

    private List<FeedEvent> events(int count) {
        List<FeedEvent> list = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            list.add(new FeedEvent(BASE + i, "Test", UUID.randomUUID(), Instant.now(), om.createObjectNode()));
        }
        return list;
    }

    private FeedPoller poller(String source, List<FeedEvent> events, Consumer<FeedEvent> handler) {
        return new FeedPoller(source, "http://unused", "key", 10, MAX_ATTEMPTS, new FixedFeed(events), cursors,
                failures, tx, handler);
    }

    private long cursor(String source) {
        return tx.execute(s -> cursors.get(source));
    }

    private List<Map<String, Object>> deadLetters(String source) {
        return jdbc.queryForList("SELECT event_id, error, attempts FROM feed_dead_letter WHERE source = ? "
                + "ORDER BY event_id", source);
    }

    @Test
    void aPoisonEventIsRetriedThenParkedAndTheFeedContinues() {
        String source = "poison-" + UUID.randomUUID();
        List<FeedEvent> feed = events(3);
        long poison = feed.get(1).id();
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        FeedPoller poller = poller(source, feed, e -> {
            if (e.id() == poison) {
                throw new IllegalStateException("boom");
            }
            applied.add(e.id());
        });

        poller.poll();
        assertThat(cursor(source)).isEqualTo(feed.get(0).id());
        poller.poll();
        assertThat(cursor(source)).isEqualTo(feed.get(0).id());
        assertThat(deadLetters(source)).isEmpty();

        poller.poll(); // third attempt: parked, and the third event is applied in the same poll
        assertThat(cursor(source)).isEqualTo(feed.get(2).id());
        assertThat(applied).containsExactlyInAnyOrder(feed.get(0).id(), feed.get(2).id());
        assertThat(deadLetters(source)).hasSize(1);
        assertThat(deadLetters(source).get(0).get("attempts")).isEqualTo(MAX_ATTEMPTS);
        assertThat((String) deadLetters(source).get(0).get("error")).contains("boom");
    }

    @Test
    void aMalformedEventIsParkedImmediately() {
        String source = "malformed-" + UUID.randomUUID();
        List<FeedEvent> feed = events(3);
        long bad = feed.get(1).id();
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        poller(source, feed, e -> {
            if (e.id() == bad) {
                throw new MalformedEventException("Missing field 'orderId'");
            }
            applied.add(e.id());
        }).poll();

        assertThat(cursor(source)).isEqualTo(feed.get(2).id());
        assertThat(applied).containsExactlyInAnyOrder(feed.get(0).id(), feed.get(2).id());
        assertThat(deadLetters(source).get(0).get("attempts")).isEqualTo(1);
        assertThat((String) deadLetters(source).get(0).get("error")).contains("Malformed").contains("orderId");
    }

    @Test
    void aBlankKeyDisablesPolling() {
        String source = "disabled-" + UUID.randomUUID();
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        new FeedPoller(source, "http://unused", "", 10, MAX_ATTEMPTS, new FixedFeed(events(2)), cursors, failures,
                tx, e -> applied.add(e.id())).poll();
        assertThat(applied).isEmpty();
        assertThat(cursor(source)).isZero();
    }
}
