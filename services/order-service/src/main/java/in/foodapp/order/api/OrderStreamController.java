package in.foodapp.order.api;

import in.foodapp.order.events.stream.OrderStreamHub;
import in.foodapp.order.service.OrderService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Live status updates for one order (server-sent events). Same access rule as {@code GET /orders/{id}}. */
@RestController
@RequestMapping("/orders")
public class OrderStreamController {

    private final OrderService service;
    private final OrderStreamHub hub;

    public OrderStreamController(OrderService service, OrderStreamHub hub) {
        this.service = service;
        this.hub = hub;
    }

    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(Authentication auth, @PathVariable UUID id) {
        UUID caller = subject(auth);
        boolean admin = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).anyMatch("ROLE_ADMIN"::equals);
        String status = service.get(id, caller, admin).status().name();
        return hub.open(id, status).orElseThrow(() -> new ApiException(
                HttpStatus.TOO_MANY_REQUESTS, "Too many streams", "Too many open connections for this order"));
    }

    private static UUID subject(Authentication auth) {
        if (auth.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            try {
                return UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException e) {
                // fall through
            }
        }
        throw ApiException.forbidden("Token subject is not a valid user id");
    }
}
