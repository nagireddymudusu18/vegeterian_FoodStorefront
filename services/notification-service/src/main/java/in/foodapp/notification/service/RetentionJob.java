package in.foodapp.notification.service;

import in.foodapp.notification.persistence.NotificationStore;
import java.time.Clock;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Data minimisation: inbox messages and their delivery records are not kept forever. */
@Component
public class RetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionJob.class);

    private final NotificationStore notifications;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final Duration keep;

    public RetentionJob(NotificationStore notifications, TransactionTemplate tx, Clock clock,
                        @Value("${NOTIFY_RETENTION_DAYS:30}") int retentionDays) {
        this.notifications = notifications;
        this.tx = tx;
        this.clock = clock;
        this.keep = Duration.ofDays(Math.max(1, retentionDays));
    }

    @Scheduled(cron = "0 17 3 * * *")
    public void purge() {
        try {
            Integer removed = tx.execute(s -> notifications.deleteOlderThan(clock.instant().minus(keep)));
            if (removed != null && removed > 0) {
                log.info("Retention: removed {} notification(s) older than {} days", removed, keep.toDays());
            }
        } catch (RuntimeException e) {
            log.error("Retention purge failed, will retry tomorrow", e);
        }
    }
}
