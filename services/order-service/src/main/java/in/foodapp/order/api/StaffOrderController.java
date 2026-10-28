package in.foodapp.order.api;

import in.foodapp.order.events.stream.StaffStreamHub;
import in.foodapp.order.service.OrderService;
import in.foodapp.order.service.StaffCaller;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Restaurant order board: list (RESTAURANT sees own restaurants, ADMIN all) and a live "changed" stream. */
@RestController
@RequestMapping("/orders/restaurant")
public class StaffOrderController {

    private final OrderService service;
    private final StaffStreamHub hub;

    public StaffOrderController(OrderService service, StaffStreamHub hub) {
        this.service = service;
        this.hub = hub;
    }

    @GetMapping
    public List<StaffOrderView> list(Authentication auth, @RequestParam(defaultValue = "false") boolean history) {
        return service.staffOrders(caller(auth), history);
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(Authentication auth) {
        StaffCaller c = caller(auth);
        return hub.open(c.userId(), c.admin()).orElseThrow(() -> new ApiException(
                HttpStatus.TOO_MANY_REQUESTS, "Too many streams", "Too many open connections"));
    }

    private static StaffCaller caller(Authentication auth) {
        boolean admin = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_ADMIN"::equals);
        if (auth.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            try {
                return new StaffCaller(UUID.fromString(jwt.getSubject()), admin);
            } catch (IllegalArgumentException e) {
                // fall through
            }
        }
        throw ApiException.forbidden("Token subject is not a valid user id");
    }
}