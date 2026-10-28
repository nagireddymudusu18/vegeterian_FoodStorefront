package in.foodapp.identity.service;

import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Per-key fixed-window limiter for unauthenticated credential endpoints (register, login). In-memory, per instance. */
@Component
public class AuthRateLimiter {

    private static final int MAX_KEYS = 10_000;

    private record Window(long startMs, int count) {
    }

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    /** True if the call is within {@code max} per {@code windowMs} for this key. */
    public boolean allow(String key, int max, long windowMs, long nowMs) {
        if (windows.size() > MAX_KEYS) {
            windows.values().removeIf(w -> nowMs - w.startMs() >= windowMs);
            if (windows.size() > MAX_KEYS) {
                windows.clear();
            }
        }
        Window w = windows.merge(key == null ? "unknown" : key, new Window(nowMs, 1),
                (old, fresh) -> nowMs - old.startMs() >= windowMs ? fresh
                        : new Window(old.startMs(), old.count() + 1));
        return w.count() <= max;
    }
}
