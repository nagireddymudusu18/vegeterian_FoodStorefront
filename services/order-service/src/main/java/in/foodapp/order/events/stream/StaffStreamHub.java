package in.foodapp.order.events.stream;

import in.foodapp.order.service.OrderStatusChangedEvent;
import java.io.IOException;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Tells restaurant (and admin) screens that one of their orders changed, after commit. A restaurant user only hears
 * about orders of restaurants they own; admins hear about all. The signal carries no order data: screens re-read
 * through the authorized list endpoint. State is per instance, so screens keep a slow refresh as a fallback.
 */
@Component
public class StaffStreamHub {

    static final int MAX_PER_USER = 5;
    static final int MAX_TOTAL = 2000;
    private static final long TIMEOUT_MS = 30 * 60 * 1000L;

    private record Conn(SseEmitter emitter, UUID userId, boolean admin) {
    }

    private final Map<SseEmitter, Conn> conns = new ConcurrentHashMap<>();
    private final AtomicInteger total = new AtomicInteger();
    private final Supplier<SseEmitter> emitterFactory;

    @Autowired
    public StaffStreamHub() {
        this(() -> new SseEmitter(TIMEOUT_MS));
    }

    StaffStreamHub(Supplier<SseEmitter> emitterFactory) {
        this.emitterFactory = emitterFactory;
    }

    public Optional<SseEmitter> open(UUID userId, boolean admin) {
        long mine = conns.values().stream().filter(c -> c.userId().equals(userId)).count();
        if (mine >= MAX_PER_USER || total.incrementAndGet() > MAX_TOTAL) {
            if (mine < MAX_PER_USER) {
                total.decrementAndGet();
            }
            return Optional.empty();
        }
        SseEmitter emitter = emitterFactory.get();
        conns.put(emitter, new Conn(emitter, userId, admin));
        Runnable cleanup = () -> {
            if (conns.remove(emitter) != null) {
                total.decrementAndGet();
            }
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());
        send(emitter, SseEmitter.event().name("changed").data("{}"));
        return Optional.of(emitter);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onStatusChanged(OrderStatusChangedEvent event) {
        for (Conn c : conns.values()) {
            if (c.admin() || c.userId().equals(event.ownerUserId())) {
                send(c.emitter(), SseEmitter.event().name("changed").data("{}"));
            }
        }
    }

    @Scheduled(fixedDelay = 25_000)
    void heartbeat() {
        for (SseEmitter e : conns.keySet()) {
            send(e, SseEmitter.event().comment("ping"));
        }
    }

    int connections() {
        return total.get();
    }

    private void send(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException ex) {
            drop(emitter);
        }
    }

    /** Forgets a connection that can no longer be written to. Never throws: one dead client must not stop the loop. */
    private void drop(SseEmitter emitter) {
        if (conns.remove(emitter) != null) {
            total.decrementAndGet();
        }
        try {
            emitter.complete();
        } catch (RuntimeException alreadyClosed) {
            // the container already closed this connection (e.g. the client went away)
        }
    }
}