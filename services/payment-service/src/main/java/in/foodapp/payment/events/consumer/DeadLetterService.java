package in.foodapp.payment.events.consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.payment.api.ApiException;
import in.foodapp.payment.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.payment.persistence.FeedFailureStore;
import in.foodapp.payment.persistence.FeedFailureStore.DeadLetter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.Metrics;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Admin handling of feed events that were parked in feed_dead_letter: list, retry or discard. */
@Service
public class DeadLetterService {

    private final FeedFailureStore store;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final OrderFeedConsumer orderFeed;

    public DeadLetterService(FeedFailureStore store, TransactionTemplate tx, ObjectMapper mapper,
                             OrderFeedConsumer orderFeed) {
        this.store = store;
        this.tx = tx;
        this.mapper = mapper;
        this.orderFeed = orderFeed;
        // alert when this is above zero: events from other services are parked and need an admin
        Gauge.builder("feed.dead_letters.open", store, FeedFailureStore::countOpen)
                .description("Feed events parked in feed_dead_letter and not yet resolved")
                .register(Metrics.globalRegistry);
    }

    public List<DeadLetter> open() {
        return store.open(200);
    }

    public long countOpen() {
        return store.countOpen();
    }

    /** Applies the parked event again. It stays parked, with the error, if it still fails. */
    public void retry(long id) {
        DeadLetter dl = store.findOpen(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found", "No open dead letter " + id));
        if (!OrderFeedConsumer.SOURCE.equals(dl.source())) {
            throw new ApiException(HttpStatus.CONFLICT, "Unknown source",
                    "No handler for feed source '" + dl.source() + "'");
        }
        FeedEvent event = new FeedEvent(dl.eventId(), dl.eventType(), dl.aggregateId(), dl.parkedAt(),
                payload(dl.payload()));
        try {
            tx.executeWithoutResult(s -> {
                orderFeed.handle(event);
                store.resolve(id, "RETRIED");
            });
        } catch (RuntimeException e) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Retry failed", e.getMessage());
        }
    }

    public void discard(long id) {
        if (!store.resolve(id, "DISCARDED")) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Not found", "No open dead letter " + id);
        }
    }

    private JsonNode payload(String json) {
        try {
            return json == null ? mapper.nullNode() : mapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored payload is not valid JSON", e);
        }
    }
}
