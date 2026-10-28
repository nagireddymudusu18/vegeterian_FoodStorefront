package in.foodapp.identity.persistence;

import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs a database action on behalf of a user, admin, partner or incoming event. A connection is borrowed from the
 * pool only for the duration of the action (one short transaction) and is released straight after, so nothing holds
 * a connection between events. Prefer this from event handlers and other non-HTTP entry points.
 */
@Component
public class DbActions {

    private final TransactionTemplate write;
    private final TransactionTemplate read;

    public DbActions(PlatformTransactionManager tx) {
        this.write = new TransactionTemplate(tx);
        this.read = new TransactionTemplate(tx);
        this.read.setReadOnly(true);
    }

    /** Runs {@code action} in its own read-write transaction. */
    public <T> T run(Supplier<T> action) {
        return write.execute(status -> action.get());
    }

    public void run(Runnable action) {
        write.executeWithoutResult(status -> action.run());
    }

    /** Runs {@code action} in its own read-only transaction. */
    public <T> T query(Supplier<T> action) {
        return read.execute(status -> action.get());
    }
}