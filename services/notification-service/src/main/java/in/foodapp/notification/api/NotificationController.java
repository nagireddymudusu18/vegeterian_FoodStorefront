package in.foodapp.notification.api;

import in.foodapp.notification.config.AppProperties;
import in.foodapp.notification.persistence.NotificationStore;
import in.foodapp.notification.persistence.NotificationStore.Item;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in user's inbox: their own messages plus broadcasts to roles they hold (for example PARTNER). */
@RestController
@RequestMapping("/notifications")
public class NotificationController {

    public record InboxView(long unread, List<Item> items) {
    }

    public record UnreadView(long unread) {
    }

    private static final int MAX_LIMIT = 100;

    private final NotificationStore store;
    private final int broadcastTtlMinutes;

    public NotificationController(NotificationStore store, AppProperties props) {
        this.store = store;
        this.broadcastTtlMinutes = props.messaging().broadcastTtlMinutes();
    }

    private static UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized",
                    "The token has no valid user id");
        }
    }

    /** Roles double as broadcast audiences. */
    private static List<String> audiences(Jwt jwt) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        return roles == null ? List.of() : roles;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public InboxView inbox(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "30") int limit) {
        UUID me = userId(jwt);
        List<String> audiences = audiences(jwt);
        int bounded = Math.max(1, Math.min(MAX_LIMIT, limit));
        return new InboxView(store.unread(me, audiences, broadcastTtlMinutes),
                store.list(me, audiences, broadcastTtlMinutes, bounded));
    }

    /** Cheap enough for the bell to poll every few seconds. */
    @GetMapping("/unread-count")
    @Transactional(readOnly = true)
    public UnreadView unread(@AuthenticationPrincipal Jwt jwt) {
        return new UnreadView(store.unread(userId(jwt), audiences(jwt), broadcastTtlMinutes));
    }

    @PostMapping("/{id}/read")
    @Transactional
    public ResponseEntity<Void> markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        if (!store.markRead(userId(jwt), audiences(jwt), broadcastTtlMinutes, id)) {
            throw ApiException.notFound("No such notification");
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/read-all")
    @Transactional
    public ResponseEntity<Void> markAllRead(@AuthenticationPrincipal Jwt jwt) {
        store.markAllRead(userId(jwt), audiences(jwt), broadcastTtlMinutes);
        return ResponseEntity.noContent().build();
    }
}
