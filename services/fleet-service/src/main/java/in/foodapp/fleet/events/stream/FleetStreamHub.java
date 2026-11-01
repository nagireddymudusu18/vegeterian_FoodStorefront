package in.foodapp.fleet.events.stream;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;
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
 * Tells open partner and admin screens that something changed, after the change has committed. Only a bare
 * "changed" signal is sent (never delivery data), so clients re-read through the normal authorized endpoints.
 * State is per instance; the screens keep a slow refresh as a fallback.
 */
@Component
public class FleetStreamHub {

    static final int MAX_TOTAL = 2000;
    private static final long TIMEOUT_MS = 30 * 60 * 1000L;

    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final AtomicInteger total = new AtomicInteger();
    private final Supplier<SseEmitter> emitterFactory;

    @Autowired
    public FleetStreamHub() {
        this(() -> new SseEmitter(TIMEOUT_MS));
    }

    FleetStreamHub(Supplier<SseEmitter> emitterFactory) {
        this.emitterFactory = emitterFactory;
    }

    /** Opens a stream that reports once straight away; empty when the connection limit is reached. */
    public Optional<SseEmitter> open() {
        if (total.incrementAndGet() > MAX_TOTAL) {
            total.decrementAndGet();
            return Optional.empty();
        }
        SseEmitter emitter = emitterFactory.get();
        emitters.add(emitter);
        Runnable cleanup = () -> {
            if (emitters.remove(emitter)) {
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
    void onChanged(FleetChangedEvent event) {
        for (SseEmitter e : emitters) {
            send(e, SseEmitter.event().name("changed").data("{}"));
        }
    }

    @Scheduled(fixedDelay = 25_000)
    void heartbeat() {
        for (SseEmitter e : emitters) {
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
        if (emitters.remove(emitter)) {
            total.decrementAndGet();
        }
        try {
            emitter.complete();
        } catch (RuntimeException alreadyClosed) {
            // the container already closed this connection (e.g. the client went away)
        }
    }
}