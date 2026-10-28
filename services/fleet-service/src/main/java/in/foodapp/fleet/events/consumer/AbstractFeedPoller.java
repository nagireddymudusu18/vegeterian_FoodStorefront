package in.foodapp.fleet.events.consumer;

import in.foodapp.fleet.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.fleet.events.consumer.FeedDtos.FeedPage;
import in.foodapp.fleet.persistence.FeedCursorStore;
import java.util.function.Consumer;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Shared polling loop: fetch a batch after the stored cursor, apply every event and advance feed_cursor in ONE
 * transaction. If the producer is down: WARN and retry next tick. Never throws out of {@link #poll()}.
 */
abstract class AbstractFeedPoller {

    private static final int MAX_BATCHES_PER_TICK = 20;

    protected final Logger log = LoggerFactory.getLogger(getClass());

    private final String source;
    private final String url;
    private final String key;
    private final int batchSize;
    private final FeedClient client;
    private final FeedCursorStore cursors;
    private final TransactionTemplate tx;
    private final Consumer<FeedEvent> handler;
    private boolean disabledLogged;

    AbstractFeedPoller(String source, String url, String key, int batchSize, FeedClient client,
                       FeedCursorStore cursors, TransactionTemplate tx, Consumer<FeedEvent> handler) {
        this.source = source;
        this.url = url;
        this.key = key;
        this.batchSize = batchSize <= 0 ? 100 : Math.min(batchSize, 500);
        this.client = client;
        this.cursors = cursors;
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
                tx.executeWithoutResult(s -> {
                    for (FeedEvent e : events) {
                        handler.accept(e);
                    }
                    cursors.set(source, next);
                });
                if (events.size() < batchSize) {
                    return;
                }
            }
        } catch (org.springframework.web.client.RestClientException e) {
            log.warn("Feed '{}' at {} unavailable, will retry: {}", source, url, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Feed '{}' batch failed (cursor not advanced), will retry", source, e);
        }
    }
}
