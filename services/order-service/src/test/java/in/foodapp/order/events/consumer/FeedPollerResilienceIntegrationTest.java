package in.foodapp.order.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import in.foodapp.order.AbstractIntegrationTest;
import in.foodapp.order.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.order.events.consumer.FeedDtos.FeedPage;
import in.foodapp.order.persistence.FeedCursorStore;
import in.foodapp.order.persistence.FeedFailureStore;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

/** A bad event must not block the feed: it is retried, then parked, and the events after it still get applied. */
class FeedPollerResilienceIntegrationTest extends AbstractIntegrationTest {

    private static final int MAX_ATTEMPTS = 3;
    private static final long BASE = 20_000_000L;

    @Autowired
    FeedCursorStore cursors;
    @Autowired
    FeedFailureStore failures;
    @Autowired
    TransactionTemplate tx;

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

    private AbstractFeedPoller poller(String source, List<FeedEvent> events, Consumer<FeedEvent> handler) {
        return new AbstractFeedPoller(source, "http://unused", "key", 10, MAX_ATTEMPTS, new FixedFeed(events),
                cursors, failures, tx, handler) {
        };
    }

    private long cursor(String source) {
        return tx.execute(s -> cursors.get(source));
    }

    private List<Map<String, Object>> deadLetters(String source) {
        return jdbc.queryForList("SELECT event_id, event_type, error, attempts, resolved_at FROM feed_dead_letter "
                + "WHERE source = ? ORDER BY event_id", source);
    }

    private long failureRows(String source) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM feed_failure WHERE source = ?", Long.class, source);
        return n == null ? 0 : n;
    }

    @Test
    void aPoisonEventIsRetriedThenParkedAndTheFeedContinues() {
        String source = "poison-" + UUID.randomUUID();
        List<FeedEvent> feed = events(3);
        long poison = feed.get(1).id();
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        AbstractFeedPoller poller = poller(source, feed, e -> {
            if (e.id() == poison) {
                throw new IllegalStateException("boom");
            }
            applied.add(e.id());
        });

        poller.poll(); // attempt 1: the first event is applied, the poison event stops the batch
        assertThat(cursor(source)).isEqualTo(feed.get(0).id());
        assertThat(deadLetters(source)).isEmpty();
        assertThat(failureRows(source)).isEqualTo(1);

        poller.poll(); // attempt 2
        assertThat(cursor(source)).isEqualTo(feed.get(0).id());
        assertThat(deadLetters(source)).isEmpty();

        poller.poll(); // attempt 3: parked, and the third event is applied in the same poll
        assertThat(cursor(source)).isEqualTo(feed.get(2).id());
        assertThat(applied).containsExactlyInAnyOrder(feed.get(0).id(), feed.get(2).id());
        assertThat(deadLetters(source)).hasSize(1);
        Map<String, Object> dl = deadLetters(source).get(0);
        assertThat(dl.get("event_id")).isEqualTo(poison);
        assertThat(dl.get("attempts")).isEqualTo(MAX_ATTEMPTS);
        assertThat((String) dl.get("error")).contains("boom");
        assertThat(dl.get("resolved_at")).isNull();
        assertThat(failureRows(source)).isZero();
    }

    @Test
    void aMalformedEventIsParkedImmediately() {
        String source = "malformed-" + UUID.randomUUID();
        List<FeedEvent> feed = events(3);
        long bad = feed.get(1).id();
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        AbstractFeedPoller poller = poller(source, feed, e -> {
            if (e.id() == bad) {
                throw new MalformedEventException("Missing field 'orderId'");
            }
            applied.add(e.id());
        });

        poller.poll();

        assertThat(cursor(source)).isEqualTo(feed.get(2).id());
        assertThat(applied).containsExactlyInAnyOrder(feed.get(0).id(), feed.get(2).id());
        Map<String, Object> dl = deadLetters(source).get(0);
        assertThat(dl.get("event_id")).isEqualTo(bad);
        assertThat(dl.get("attempts")).isEqualTo(1);
        assertThat((String) dl.get("error")).contains("Malformed").contains("orderId");
    }

    @Test
    void aFailureThatGoesAwayIsNotParked() {
        String source = "transient-" + UUID.randomUUID();
        List<FeedEvent> feed = events(3);
        long flaky = feed.get(1).id();
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        AbstractFeedPoller poller = poller(source, feed, e -> {
            if (e.id() == flaky && calls.getAndIncrement() < 2) {
                throw new IllegalStateException("temporarily unavailable");
            }
            applied.add(e.id());
        });

        poller.poll();
        assertThat(cursor(source)).isEqualTo(feed.get(0).id());
        poller.poll();

        assertThat(cursor(source)).isEqualTo(feed.get(2).id());
        assertThat(applied).hasSize(3);
        assertThat(deadLetters(source)).isEmpty();
        assertThat(failureRows(source)).isZero();
    }

    @Test
    void aHealthyBatchStillAppliesInOnePass() {
        String source = "healthy-" + UUID.randomUUID();
        List<FeedEvent> feed = events(5);
        Set<Long> applied = ConcurrentHashMap.newKeySet();
        poller(source, feed, e -> applied.add(e.id())).poll();
        assertThat(cursor(source)).isEqualTo(feed.get(4).id());
        assertThat(applied).hasSize(5);
        assertThat(deadLetters(source)).isEmpty();
    }

    @Test
    void theHandlerSeesTheOriginalPayloadWhenParked() {
        String source = "payload-" + UUID.randomUUID();
        JsonNode payload = om.createObjectNode().put("orderId", "not-a-uuid");
        FeedEvent bad = new FeedEvent(BASE + 1, "PaymentCaptured", UUID.randomUUID(), Instant.now(), payload);
        poller(source, List.of(bad), e -> {
            throw new MalformedEventException("Field 'orderId' is not a UUID");
        }).poll();

        String stored = jdbc.queryForObject("SELECT payload::text FROM feed_dead_letter WHERE source = ?",
                String.class, source);
        assertThat(stored).contains("not-a-uuid");
    }
}
