package in.foodapp.identity.api;

import in.foodapp.identity.persistence.FeatureFlag;
import in.foodapp.identity.service.FeatureFlagService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FlagController {

    public record FlagView(String key, boolean enabled, String description, Instant updatedAt, UUID updatedBy) {
        static FlagView of(FeatureFlag f) {
            return new FlagView(f.getKey(), f.isEnabled(), f.getDescription(), f.getUpdatedAt(), f.getUpdatedBy());
        }
    }

    public record FlagUpdate(@NotNull Boolean enabled) {
    }

    private final FeatureFlagService flags;
    private final in.foodapp.identity.service.UserService users;

    public FlagController(FeatureFlagService flags, in.foodapp.identity.service.UserService users) {
        this.flags = flags;
        this.users = users;
    }

    /** Public: the storefront reads this on load to decide which features to show. */
    @GetMapping("/flags")
    public Map<String, Boolean> publicFlags() {
        return flags.snapshot();
    }

    public record OwnerGrant(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Email String email) {
    }

    /** Grants the RESTAURANT role; the admin then links the restaurant to the returned userId in catalog. */
    @org.springframework.web.bind.annotation.PostMapping("/admin/restaurant-owners")
    public Map<String, UUID> grantOwner(@Valid @RequestBody OwnerGrant body) {
        return Map.of("userId", users.grantRestaurantRole(body.email()));
    }

    /** Re-publishes encrypted UserContactUpdated outbox events for existing verified users (Finding 11 backfill). */
    @org.springframework.web.bind.annotation.PostMapping("/admin/contacts/backfill")
    public Map<String, Integer> backfillContacts() {
        return Map.of("published", users.backfillVerifiedContacts());
    }

    public record RolePatchRequest(@jakarta.validation.constraints.NotBlank String role, @NotNull Boolean enabled) {
    }

    /** Lists active platform accounts and their assigned portal roles for Org Admin RBAC oversight. */
    @GetMapping("/admin/users")
    public List<Dtos.MeResponse> listUsers() {
        return users.listAllForAdmin();
    }

    /** Grants or revokes operational portal roles (RESTAURANT, PARTNER) on an active user account. */
    @org.springframework.web.bind.annotation.PatchMapping("/admin/users/{userId}/roles")
    public Dtos.MeResponse setUserRole(@PathVariable UUID userId, @Valid @RequestBody RolePatchRequest body) {
        return users.updateOperationalRole(userId, body.role(), body.enabled());
    }

    @GetMapping("/admin/flags")
    public List<FlagView> list() {
        return flags.list().stream().map(FlagView::of).toList();
    }

    @PutMapping("/admin/flags/{key}")
    public FlagView update(@PathVariable String key, @Valid @RequestBody FlagUpdate body,
                           @AuthenticationPrincipal Jwt jwt) {
        return FlagView.of(flags.set(key, body.enabled(), UUID.fromString(jwt.getSubject())));
    }
}
