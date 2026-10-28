package in.foodapp.order.events.consumer;

import in.foodapp.order.config.AppProperties;
import in.foodapp.order.persistence.FeedCursorStore;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class PaymentFeedPoller extends AbstractFeedPoller {

    public static final String SOURCE = "payment";

    public PaymentFeedPoller(AppProperties props, FeedClient client, FeedCursorStore cursors,
                             TransactionTemplate tx, PaymentEventHandler handler) {
        super(SOURCE, props.feed().paymentUrl(), props.feed().paymentKey(), props.feed().batchSize(),
                client, cursors, tx, handler::handle);
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    @Override
    public void poll() {
        super.poll();
    }
}
