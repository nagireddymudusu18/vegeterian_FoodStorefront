package in.foodapp.notification.events.consumer;

import in.foodapp.notification.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.notification.events.consumer.FeedDtos.FeedPage;
import in.foodapp.notification.persistence.FeedCursorStore;
import in.foodapp.notification.persistence.FeedFailureStore;
import io.micrometer.core.instrument.Metrics;
import java.util.List;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Shared polling loop: fetch a batch after the stored cursor, apply every event and advance feed_cursor in ONE
 * transaction. If the producer is down: WARN and retry next tick. Never throws out of {@link #poll()}.
 *
 * <p>If a batch fails, its events are re-applied one at a time so a single bad event cannot block the feed: a
 * failing event is retried on later polls and, after {@code maxAttempts} attempts, parked in feed_dead_letter
 * (an admin can retry or discard it); a {@link MalformedEventException} is parked straight away. Either way the
 * cursor moves on, so the events after it are still applied.
 */
class FeedPoller {

    private static final int MAX_BATCHES_PER_TICK = 20;

    private final Logger log = LoggerFactory.getLogger(FeedPoller.class);

    private final String source;
    private final String url;
    private final String key;
    private final int batchSize;
    private final int maxAttempts;
    private final FeedClient client;
    private final FeedCursorStore cursors;
    private final FeedFailureStore failures;
    private final TransactionTemplate tx;
    private final Consumer<FeedEvent> handler;
    private boolean disabledLogged;

    FeedPoller(String source, String url, String key, int batchSize, int maxAttempts, FeedClient client,
               FeedCursorStore cursors, FeedFailureStore failures, TransactionTemplate tx,
               Consumer<FeedEvent> handler) {
        this.source = source;
        this.url = url;
        this.key = key;
        this.batchSize = batchSize <= 0 ? 100 : Math.min(batchSize, 500);
        this.maxAttempts = maxAttempts <= 0 ? 5 : maxAttempts;
        this.client = client;
        this.cursors = cursors;
        this.failures = failures;
        this.tx = tx;
        this.handler = handler;
    }

    public void poll() {
        if (key == null || key.isBlank()) {
            if (!disabledLogged) {
                disabledLogged = true;
                log.info("Feed key for '{}' is blank; polling of {} is disabled", source, url);
            }
            return;
        }
        try {
            for (int i = 0; i < MAX_BATCHES_PER_TICK; i++) {
                long cursor = tx.execute(s -> cursors.get(source));
                FeedPage page = client.fetch(url, key, cursor, batchSize);
                List<FeedEvent> events = page == null ? List.of() : page.safeEvents();
                if (events.isEmpty()) {
                    return;
                }
                long next = Math.max(page.nextCursor(), events.get(events.size() - 1).id());
                if (!apply(events, next) || events.size() < batchSize) {
                    return;
                }
            }
        } catch (org.springframework.web.client.RestClientException e) {
            log.warn("Feed '{}' at {} unavailable, will retry: {}", source, url, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Feed '{}' poll failed (cursor not advanced past the last applied event), will retry",
                    source, e);
        }
    }

    /** Fast path: the whole batch in one transaction. If anything fails, redo it one event at a time. */
    private boolean apply(List<FeedEvent> events, long next) {
        try {
            tx.executeWithoutResult(s -> {
                for (FeedEvent e : events) {
                    handleInContext(e);
                }
                cursors.set(source, next);
                failures.clearFailuresUpTo(source, next);
            });
            count("applied", events.size());
            return true;
        } catch (RuntimeException batchFailure) {
            log.warn("Feed '{}' batch failed ({}); applying its events one at a time", source,
                    batchFailure.toString());
            return applyOneByOne(events);
        }
    }

    /** @return false when it stopped at an event that will be retried on the next poll. */
    private boolean applyOneByOne(List<FeedEvent> events) {
        for (FeedEvent e : events) {
            try {
                tx.executeWithoutResult(s -> {
                    handleInContext(e);
                    cursors.set(source, e.id());
                    failures.clearFailure(source, e.id());
                });
                count("applied", 1);
            } catch (MalformedEventException ex) {
                park(e, "Malformed event: " + ex.getMessage(), 1);
            } catch (RuntimeException ex) {
                String error = ex.toString();
                int attempts = tx.execute(s -> failures.recordFailure(source, e.id(), error));
                if (attempts >= maxAttempts) {
                    park(e, error, attempts);
                } else {
                    count("failed", 1);
                    log.warn("Feed '{}' event {} ({}) failed, attempt {} of {}, will retry: {}", source, e.id(),
                            e.type(), attempts, maxAttempts, error);
                    return false;
                }
            }
        }
        return true;
    }

    /** Applies one event with a context id in the logs, so its log lines can be found: feed-&lt;source&gt;-&lt;eventId&gt;. */
    private void handleInContext(FeedEvent e) {
        MDC.put("requestId", "feed-" + source + "-" + e.id());
        try {
            handler.accept(e);
        } finally {
            MDC.remove("requestId");
        }
    }

    private void count(String outcome, int n) {
        Metrics.counter("feed.events", "source", source, "outcome", outcome).increment(n);
    }

    /** Moves the event to feed_dead_letter and the cursor past it, in one transaction. */
    private void park(FeedEvent e, String error, int attempts) {
        tx.executeWithoutResult(s -> {
            failures.park(source, e.id(), e.type(), e.aggregateId(), e.payload() == null ? null : e.payload().toString(),
                    error, attempts);
            failures.clearFailure(source, e.id());
            cursors.set(source, e.id());
        });
        count("parked", 1);
        log.error("Feed '{}' event {} ({}) parked in feed_dead_letter after {} attempt(s): {}", source, e.id(),
                e.type(), attempts, error);
    }
}
