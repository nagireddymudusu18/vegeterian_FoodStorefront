package in.foodapp.order.api;

import in.foodapp.order.domain.OrderStatus;
import in.foodapp.order.service.OrderService;
import in.foodapp.order.service.StaffCaller;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
public class OrderController {

    private final OrderService service;

    public OrderController(OrderService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<OrderView> create(
            Authentication auth,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreateOrderRequest request) {
        OrderService.CreateResult result = service.create(subject(auth), idempotencyKey, request);
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED)
                .body(result.order());
    }

    @GetMapping("/{id}")
    public OrderView get(Authentication auth, @PathVariable UUID id) {
        return service.get(id, subject(auth), hasRole(auth, "ROLE_ADMIN"));
    }

    @GetMapping
    public List<OrderView> list(Authentication auth) {
        return service.list(subject(auth));
    }

    @PostMapping("/{id}/cancel")
    public OrderView cancel(Authentication auth, @PathVariable UUID id) {
        return service.cancel(id, subject(auth));
    }

    // ---- merchant / admin transitions (role-checked in SecurityConfig, per-restaurant ownership in OrderService)

    @PostMapping("/{id}/accept")
    public OrderView accept(Authentication auth, @PathVariable UUID id) {
        return service.staffTransition(id, staff(auth), OrderStatus.MERCHANT_ACCEPTED, null);
    }

    @PostMapping("/{id}/reject")
    public OrderView reject(Authentication auth, @PathVariable UUID id,
                            @Valid @RequestBody(required = false) ReasonRequest body) {
        return service.staffTransition(id, staff(auth), OrderStatus.REJECTED_BY_MERCHANT,
                body == null ? null : body.reason());
    }

    @PostMapping("/{id}/preparing")
    public OrderView preparing(Authentication auth, @PathVariable UUID id) {
        return service.staffTransition(id, staff(auth), OrderStatus.PREPARING, null);
    }

    @PostMapping("/{id}/rider-assigned")
    public OrderView riderAssigned(Authentication auth, @PathVariable UUID id) {
        return service.staffTransition(id, staff(auth), OrderStatus.RIDER_ASSIGNED, null);
    }

    @PostMapping("/{id}/picked-up")
    public OrderView pickedUp(Authentication auth, @PathVariable UUID id) {
        return service.staffTransition(id, staff(auth), OrderStatus.PICKED_UP, null);
    }

    @PostMapping("/{id}/deliver")
    public OrderView deliver(Authentication auth, @PathVariable UUID id, @Valid @RequestBody DeliverRequest body) {
        return service.deliver(id, staff(auth), body.otp());
    }

    // ---- delivery partner (assigned by fleet-service; ownership checked in OrderService)

    @PostMapping("/{id}/rider/picked-up")
    public RiderOrderView riderPickedUp(Authentication auth, @PathVariable UUID id) {
        return service.riderPickedUp(id, subject(auth));
    }

    @PostMapping("/{id}/rider/deliver")
    public RiderOrderView riderDeliver(Authentication auth, @PathVariable UUID id,
                                       @Valid @RequestBody DeliverRequest body) {
        return service.riderDeliver(id, subject(auth), body.otp());
    }

    private static StaffCaller staff(Authentication auth) {
        return new StaffCaller(subject(auth), hasRole(auth, "ROLE_ADMIN"));
    }

    private static UUID subject(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            try {
                return UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException e) {
                // fall through
            }
        }
        throw ApiException.forbidden("Token subject is not a valid user id");
    }

    private static boolean hasRole(Authentication auth, String role) {
        for (GrantedAuthority a : auth.getAuthorities()) {
            if (role.equals(a.getAuthority())) {
                return true;
            }
        }
        return false;
    }
}
