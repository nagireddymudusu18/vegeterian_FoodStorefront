package in.foodapp.catalog.api;

import in.foodapp.catalog.domain.Diet;
import in.foodapp.catalog.service.Caller;
import in.foodapp.catalog.service.CatalogService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class CatalogController {

    private final CatalogService service;

    public CatalogController(CatalogService service) {
        this.service = service;
    }

    @GetMapping("/restaurants")
    public List<RestaurantView> search(@RequestParam double lat,
                                       @RequestParam double lng,
                                       @RequestParam(defaultValue = "5000") int radiusMeters,
                                       @RequestParam(required = false) Diet diet,
                                       @RequestParam(required = false) String q) {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "lat/lng out of range");
        }
        if (radiusMeters <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "radiusMeters must be positive");
        }
        return service.searchRestaurants(lat, lng, radiusMeters, diet, q);
    }

    @GetMapping("/restaurants/{id}")
    public RestaurantView get(@PathVariable UUID id) {
        return service.getRestaurant(id);
    }

    @GetMapping("/restaurants/{id}/menu")
    public List<MenuItemView> menu(@PathVariable UUID id, @RequestParam(required = false) Diet diet) {
        return service.getMenu(id, diet);
    }

    @PostMapping("/restaurants")
    public ResponseEntity<RestaurantView> create(@Valid @RequestBody RestaurantRequest req,
                                                 @AuthenticationPrincipal Jwt jwt) {
        RestaurantView created = service.createRestaurant(req, caller(jwt));
        return ResponseEntity.created(URI.create("/restaurants/" + created.id())).body(created);
    }

    @PutMapping("/restaurants/{id}")
    public RestaurantView update(@PathVariable UUID id, @Valid @RequestBody RestaurantRequest req,
                                 @AuthenticationPrincipal Jwt jwt) {
        return service.updateRestaurant(id, req, caller(jwt));
    }

    @PostMapping("/restaurants/{id}/items")
    public ResponseEntity<MenuItemView> addItem(@PathVariable UUID id, @Valid @RequestBody MenuItemRequest req,
                                                @AuthenticationPrincipal Jwt jwt) {
        MenuItemView created = service.addItem(id, req, caller(jwt));
        return ResponseEntity.created(URI.create("/restaurants/" + id + "/menu")).body(created);
    }

    @PutMapping("/items/{id}")
    public MenuItemView updateItem(@PathVariable UUID id, @Valid @RequestBody MenuItemRequest req,
                                   @AuthenticationPrincipal Jwt jwt) {
        return service.updateItem(id, req, caller(jwt));
    }

    @PatchMapping("/items/{id}/availability")
    public MenuItemView availability(@PathVariable UUID id, @Valid @RequestBody AvailabilityRequest req,
                                     @AuthenticationPrincipal Jwt jwt) {
        return service.setAvailability(id, req.available(), caller(jwt));
    }

    private static Caller caller(Jwt jwt) {
        UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token subject is not a UUID");
        }
        List<String> roles = jwt.getClaimAsStringList("roles");
        boolean admin = roles != null && roles.contains("ADMIN");
        return new Caller(userId, admin);
    }
}
