package in.foodapp.identity.api;

import in.foodapp.identity.service.AdminTeamService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Managing the admin team. SecurityConfig restricts every route here to the main admin (SUPER_ADMIN). */
@RestController
@RequestMapping("/admin/team")
public class AdminTeamController {

    private final AdminTeamService access;

    public AdminTeamController(AdminTeamService access) {
        this.access = access;
    }

    @GetMapping
    public Dtos.TeamView team() {
        return access.team();
    }

    @PostMapping("/invites")
    public ResponseEntity<Dtos.Accepted> invite(@Valid @RequestBody Dtos.InviteRequest body,
                                                @AuthenticationPrincipal Jwt jwt) {
        access.invite(UUID.fromString(jwt.getSubject()), body.email());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new Dtos.Accepted("Invite sent"));
    }

    @DeleteMapping("/invites/{id}")
    public ResponseEntity<Void> revokeInvite(@PathVariable UUID id) {
        access.revokeInvite(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/members/{userId}")
    public ResponseEntity<Void> remove(@PathVariable UUID userId, @AuthenticationPrincipal Jwt jwt) {
        access.remove(UUID.fromString(jwt.getSubject()), userId);
        return ResponseEntity.noContent().build();
    }
}
