package in.foodapp.fleet.api;

import in.foodapp.fleet.api.Views.DeliveryView;
import in.foodapp.fleet.api.Views.PartnerView;
import in.foodapp.fleet.service.FleetService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Roles are enforced in SecurityConfig: /fleet/admin/** needs ADMIN, everything else PARTNER. */
@RestController
@RequestMapping("/fleet")
public class FleetController {

    private final FleetService service;

    public FleetController(FleetService service) {
        this.service = service;
    }

    @PostMapping("/partners/me")
    public PartnerView register(Authentication auth, @Valid @RequestBody Requests.Register body) {
        return service.register(subject(auth), body.name(), body.vehicle());
    }

    @GetMapping("/me")
    public PartnerView me(Authentication auth) {
        return service.me(subject(auth));
    }

    @PutMapping("/me/online")
    public PartnerView online(Authentication auth, @Valid @RequestBody Requests.Online body) {
        return service.setOnline(subject(auth), body.online());
    }

    @GetMapping("/me/deliveries")
    public List<DeliveryView> mine(Authentication auth) {
        return service.mine(subject(auth));
    }

    @GetMapping("/pool")
    public List<DeliveryView> pool(Authentication auth) {
        return service.pool(subject(auth));
    }

    @PostMapping("/deliveries/{orderId}/accept")
    public DeliveryView accept(Authentication auth, @PathVariable UUID orderId) {
        return service.accept(subject(auth), orderId);
    }

    // ---- admin

    @GetMapping("/admin/deliveries")
    public List<DeliveryView> adminDeliveries(@RequestParam(required = false) String status) {
        return service.adminDeliveries(status);
    }

    @GetMapping("/admin/partners")
    public List<PartnerView> adminPartners() {
        return service.adminPartners();
    }

    @PostMapping("/admin/deliveries/{orderId}/assign")
    public DeliveryView assign(@PathVariable UUID orderId, @Valid @RequestBody Requests.Assign body) {
        return service.adminAssign(orderId, body.partnerId());
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
}