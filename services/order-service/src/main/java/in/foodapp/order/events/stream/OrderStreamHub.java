package in.foodapp.order.events.stream;

import in.foodapp.order.service.OrderStatusChangedEvent;
import java.io.IOException;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Pushes order status changes to open server-sent-event connections. Only the new status name is sent (never order
 * data), so clients re-read the order through the normal authorized endpoint. State is in-memory: with several
 * instances a client only hears changes made on its own instance, which is why the storefront keeps a slow poll.
 */
@Component
public class OrderStreamHub {

    private static final Logger log = LoggerFactory.getLogger(OrderStreamHub.class);

    static final int MAX_PER_ORDER = 5;
    static final int MAX_TOTAL = 5000;
    private static final long TIMEOUT_MS = 30 * 60 * 1000L;

    /** One open connection. */
    interface Sink {
        void status(String status) throws IOException;

        void ping() throws IOException;
    }

    private final Map<UUID, Set<Sink>> sinks = new ConcurrentHashMap<>();
    private final AtomicInteger total = new AtomicInteger();
    private final Executor executor;

    @Autowired
    public OrderStreamHub() {
        this(Executors.newVirtualThreadPerTaskExecutor());
    }

    OrderStreamHub(Executor executor) {
        this.executor = executor;
    }

    /** Opens a stream that first reports {@code currentStatus}; empty when connection limits are reached. */
    public Optional<SseEmitter> open(UUID orderId, String currentStatus) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        Sink sink = new Sink() {
            @Override
            public void status(String status) throws IOException {
                emitter.send(SseEmitter.event().name("status").data("{\"status\":\"" + status + "\"}"));
            }

            @Override
            public void ping() throws IOException {
                emitter.send(SseEmitter.event().comment("ping"));
            }
        };
        if (!register(orderId, sink)) {
            return Optional.empty();
        }
        Runnable cleanup = () -> unregister(orderId, sink);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());
        deliver(orderId, sink, s -> s.status(currentStatus));
        return Optional.of(emitter);
    }

    boolean register(UUID orderId, Sink sink) {
        if (total.get() >= MAX_TOTAL) {
            return false;
        }
        boolean[] added = {false};
        sinks.compute(orderId, (id, set) -> {
            Set<Sink> s = set != null ? set : ConcurrentHashMap.newKeySet();
            if (s.size() < MAX_PER_ORDER && s.add(sink)) {
                added[0] = true;
            }
            return s.isEmpty() ? null : s;
        });
        if (added[0]) {
            total.incrementAndGet();
        }
        return added[0];
    }

    void unregister(UUID orderId, Sink sink) {
        boolean[] removed = {false};
        sinks.computeIfPresent(orderId, (id, set) -> {
            removed[0] = set.remove(sink);
            return set.isEmpty() ? null : set;
        });
        if (removed[0]) {
            total.decrementAndGet();
        }
    }

    int openConnections() {
        return total.get();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onStatusChanged(OrderStatusChangedEvent event) {
        Set<Sink> set = sinks.get(event.orderId());
        if (set == null) {
            return;
        }
        for (Sink sink : set) {
            deliver(event.orderId(), sink, s -> s.status(event.status().name()));
        }
    }

    @Scheduled(fixedDelay = 25_000)
    void heartbeat() {
        sinks.forEach((orderId, set) -> set.forEach(sink -> deliver(orderId, sink, Sink::ping)));
    }

    private interface Send {
        void run(Sink sink) throws IOException;
    }

    private void deliver(UUID orderId, Sink sink, Send send) {
        executor.execute(() -> {
            try {
                send.run(sink);
            } catch (IOException | IllegalStateException e) {
                log.debug("Dropping closed order stream for {}", orderId);
                unregister(orderId, sink);
            }
        });
    }
}
