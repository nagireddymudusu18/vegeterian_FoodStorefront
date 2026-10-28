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
