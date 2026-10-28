package in.foodapp.identity.events;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class InternalEventsController {

    public record FeedResponse(List<OutboxService.FeedEvent> events, long nextCursor) {
    }

    private final OutboxService outbox;
    private final byte[] keyDigest;

    public InternalEventsController(OutboxService outbox, AppProperties props) {
        this.outbox = outbox;
        String key = props.internalFeedKey();
        this.keyDigest = (key == null || key.isBlank()) ? null : sha256(key);
    }

    @GetMapping("/internal/events")
    public FeedResponse events(@RequestHeader(value = "X-Internal-Key", required = false) String key,
                               @RequestParam(value = "after", defaultValue = "0") long after,
                               @RequestParam(value = "limit", defaultValue = "100") int limit) {
        if (keyDigest == null || key == null || !MessageDigest.isEqual(keyDigest, sha256(key))) {
            throw ApiException.unauthorized("Invalid or missing X-Internal-Key");
        }
        int bounded = Math.max(1, Math.min(500, limit));
        long cursor = Math.max(0, after);
        List<OutboxService.FeedEvent> events = outbox.readAfter(cursor, bounded);
        long next = events.isEmpty() ? cursor : events.get(events.size() - 1).id();
        return new FeedResponse(events, next);
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
