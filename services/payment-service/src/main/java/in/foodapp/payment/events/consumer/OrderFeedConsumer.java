package in.foodapp.payment.events.consumer;

import static in.foodapp.payment.events.consumer.MalformedEventException.text;
import static in.foodapp.payment.events.consumer.MalformedEventException.uuid;

import in.foodapp.payment.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.payment.persistence.FeedCursorStore;
import in.foodapp.payment.persistence.FeedFailureStore;
import in.foodapp.payment.service.PaymentService;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Polls order-service's event feed. When an order is cancelled or rejected, every captured payment of that order
 * is refunded (see {@link PaymentService#onOrderClosed}); all other events are ignored.
 */
@Component
public class OrderFeedConsumer {

    public static final String SOURCE = "order";

    private static final Set<String> CLOSED = Set.of("CANCELLED", "REJECTED_BY_MERCHANT");

    private final PaymentService payments;
    private final FeedPoller poller;

    public OrderFeedConsumer(PaymentService payments, FeedClient client, FeedCursorStore cursors,
                             FeedFailureStore failures, TransactionTemplate tx,
                             @Value("${app.feed.order-url:}") String url,
                             @Value("${app.feed.order-key:}") String key,
                             @Value("${app.feed.batch-size:100}") int batchSize,
                             @Value("${app.feed.max-attempts:5}") int maxAttempts) {
        this.payments = payments;
        this.poller = new FeedPoller(SOURCE, url, key, batchSize, maxAttempts, client, cursors, failures, tx,
                this::handle);
    }

    /** Also used to retry a parked event from the dead-letter API. */
    public void handle(FeedEvent event) {
        if (!"OrderStatusChanged".equals(event.type())) {
            return;
        }
        String to = text(event.payload(), "to");
        if (CLOSED.contains(to)) {
            payments.onOrderClosed(uuid(event.payload(), "orderId"), to);
        }
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    void poll() {
        poller.poll();
    }
}
