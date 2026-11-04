package in.foodapp.notification.events.consumer;

import in.foodapp.notification.config.AppProperties;
import in.foodapp.notification.persistence.FeedCursorStore;
import in.foodapp.notification.persistence.FeedFailureStore;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import in.foodapp.notification.events.consumer.FeedDtos.FeedEvent;

/** One poller per producer feed; each keeps its own cursor, so a slow or down producer holds up only itself. */
@Component
public class FeedPollers {

    public static final String IDENTITY = "identity";
    public static final String CATALOG = "catalog";
    public static final String ORDER = "order";
    public static final String PAYMENT = "payment";
    public static final String FLEET = "fleet";

    private final FeedPoller identity;
    private final FeedPoller catalog;
    private final FeedPoller order;
    private final FeedPoller payment;
    private final FeedPoller fleet;

    public FeedPollers(AppProperties props, FeedClient client, FeedCursorStore cursors, FeedFailureStore failures,
                       TransactionTemplate tx, EventHandlers handlers) {
        AppProperties.Feed f = props.feed();
        this.identity = poller(IDENTITY, f.identityUrl(), f.identityKey(), f, client, cursors, failures, tx,
                handlers::identity);
        this.catalog = poller(CATALOG, f.catalogUrl(), f.catalogKey(), f, client, cursors, failures, tx,
                handlers::catalog);
        this.order = poller(ORDER, f.orderUrl(), f.orderKey(), f, client, cursors, failures, tx, handlers::order);
        this.payment = poller(PAYMENT, f.paymentUrl(), f.paymentKey(), f, client, cursors, failures, tx,
                handlers::payment);
        this.fleet = poller(FLEET, f.fleetUrl(), f.fleetKey(), f, client, cursors, failures, tx, handlers::fleet);
    }

    private static FeedPoller poller(String source, String url, String key, AppProperties.Feed f, FeedClient client,
                                     FeedCursorStore cursors, FeedFailureStore failures, TransactionTemplate tx,
                                     Consumer<FeedEvent> handler) {
        return new FeedPoller(source, url, key, f.batchSize(), f.maxAttempts(), client, cursors, failures, tx,
                handler);
    }

    /** The handler to use when an admin retries a parked event from this source. */
    static Map<String, Consumer<FeedEvent>> handlersBySource(EventHandlers h) {
        return Map.of(IDENTITY, h::identity, CATALOG, h::catalog, ORDER, h::order, PAYMENT, h::payment,
                FLEET, h::fleet);
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    void pollIdentity() {
        identity.poll();
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    void pollCatalog() {
        catalog.poll();
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    void pollOrder() {
        order.poll();
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    void pollPayment() {
        payment.poll();
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    void pollFleet() {
        fleet.poll();
    }
}
