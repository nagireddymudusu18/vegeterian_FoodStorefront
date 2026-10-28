package in.foodapp.catalog.events;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Pull feed of outbox events for other services; guarded by X-Internal-Key (not JWT). */
@RestController
public class InternalEventsController {

    private final OutboxService outbox;
    private final byte[] expectedKey;

    public InternalEventsController(OutboxService outbox,
                                    @Value("${app.internal-feed-key}") String internalKey) {
        this.outbox = outbox;
        this.expectedKey = internalKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/internal/events")
    public OutboxService.Feed events(@RequestHeader(name = "X-Internal-Key", required = false) String key,
                                     @RequestParam(defaultValue = "0") long after,
                                     @RequestParam(defaultValue = "100") int limit) {
        if (key == null || expectedKey.length == 0
                || !MessageDigest.isEqual(expectedKey, key.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or missing X-Internal-Key");
        }
        int bounded = Math.max(1, Math.min(500, limit));
        return outbox.read(Math.max(0, after), bounded);
    }
}
