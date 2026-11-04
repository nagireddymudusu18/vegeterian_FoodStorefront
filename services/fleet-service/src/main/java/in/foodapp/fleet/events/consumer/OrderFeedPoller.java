package in.foodapp.fleet.events.consumer;

import in.foodapp.fleet.config.AppProperties;
import in.foodapp.fleet.persistence.FeedCursorStore;
import in.foodapp.fleet.persistence.FeedFailureStore;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OrderFeedPoller extends AbstractFeedPoller {

    public static final String SOURCE = "order";

    public OrderFeedPoller(AppProperties props, FeedClient client, FeedCursorStore cursors,
                           FeedFailureStore failures, TransactionTemplate tx, OrderEventHandler handler) {
        super(SOURCE, props.feed().orderUrl(), props.feed().orderKey(), props.feed().batchSize(),
                props.feed().maxAttempts(), client, cursors, failures, tx, handler::handle);
    }

    @Scheduled(fixedDelayString = "${FEED_POLL_MS:2000}")
    @Override
    public void poll() {
        super.poll();
    }
}