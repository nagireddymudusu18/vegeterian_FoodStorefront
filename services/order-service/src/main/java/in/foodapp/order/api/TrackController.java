package in.foodapp.order.api;

import in.foodapp.order.service.OrderService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public order tracking by order number. Unauthenticated, so it is rate limited per client IP. */
@RestController
@RequestMapping("/orders/track")
public class TrackController {

    static final int MAX_PER_MINUTE = 30;
    private static final int MAX_TRACKED_IPS = 10_000;
    private static final long WINDOW_MS = 60_000;

    private record Window(long startMs, int count) {
    }

    private final OrderService service;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public TrackController(OrderService service) {
        this.service = service;
    }

    @GetMapping("/{orderNumber}")
    public ResponseEntity<TrackView> track(@PathVariable String orderNumber, HttpServletRequest request) {
        if (!allow(request.getRemoteAddr(), System.currentTimeMillis())) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests",
                    "Too many lookups. Please try again in a minute.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.track(orderNumber));
    }

    boolean allow(String ip, long nowMs) {
        if (windows.size() > MAX_TRACKED_IPS) {
            windows.values().removeIf(w -> nowMs - w.startMs() >= WINDOW_MS);
            if (windows.size() > MAX_TRACKED_IPS) {
                windows.clear();
            }
        }
        Window w = windows.merge(ip == null ? "unknown" : ip, new Window(nowMs, 1),
                (old, fresh) -> nowMs - old.startMs() >= WINDOW_MS ? fresh : new Window(old.startMs(), old.count() + 1));
        return w.count() <= MAX_PER_MINUTE;
    }
}
