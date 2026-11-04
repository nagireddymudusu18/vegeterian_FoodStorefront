package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.api.Dtos;
import in.foodapp.identity.config.AppProperties;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.infra.email.EmailSender;
import in.foodapp.identity.persistence.AdminInvite;
import in.foodapp.identity.persistence.AdminInviteRepository;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The admin team the main admin manages: listing, invites, accepting an invite, and removals. */
@Service
public class AdminTeamService {

    private static final Logger log = LoggerFactory.getLogger(AdminTeamService.class);
    static final Duration INVITE_TTL = Duration.ofDays(7);
    private static final String BAD_INVITE = "This invite is invalid or has expired";

    private final CredentialService credentials;
    private final RoleResolver roles;
    private final RefreshTokenService refreshTokens;
    private final UserRepository users;
    private final AdminInviteRepository invites;
    private final PasswordService passwords;
    private final PiiCipher cipher;
    private final EmailSender emails;
    private final AppProperties props;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AdminTeamService(CredentialService credentials, RoleResolver roles, RefreshTokenService refreshTokens,
                            UserRepository users, AdminInviteRepository invites, PasswordService passwords,
                            PiiCipher cipher, EmailSender emails, AppProperties props, Clock clock) {
        this.credentials = credentials;
        this.roles = roles;
        this.refreshTokens = refreshTokens;
        this.users = users;
        this.invites = invites;
        this.passwords = passwords;
        this.cipher = cipher;
        this.emails = emails;
        this.props = props;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Dtos.TeamView team() {
        List<Dtos.TeamMember> members = new ArrayList<>();
        roles.mainAdmin().filter(roles::isAdmin).ifPresent(main -> members.add(member(main, true)));
        users.findStoredAdmins().stream().filter(u -> !roles.isMainAdmin(u)).filter(roles::isAdmin)
                .forEach(u -> members.add(member(u, false)));
        List<Dtos.TeamInvite> pending = invites.findPending(clock.instant()).stream()
                .map(i -> new Dtos.TeamInvite(i.getId(), PasswordService.maskEmail(cipher.decrypt(i.getEmailEnc())),
                        i.getExpiresAt()))
                .toList();
        return new Dtos.TeamView(members, pending);
    }

    private Dtos.TeamMember member(User u, boolean main) {
        String name = u.getNameEnc() == null ? null : cipher.decrypt(u.getNameEnc());
        return new Dtos.TeamMember(u.getId(), name, PasswordService.maskEmail(cipher.decrypt(u.getEmailEnc())), main);
    }

    /** Emails a one-time invite link. The invitee must register and verify this address, then accept the link. */
    @Transactional
    public void invite(UUID invitedBy, String rawEmail) {
        String email = passwords.normaliseEmail(rawEmail);
        String hash = cipher.blindIndex("email:" + email);
        User existing = users.findByEmailHash(hash).filter(User::isActive).orElse(null);
        if (existing != null && roles.isAdmin(existing)) {
            throw ApiException.badRequest("That person is already an administrator");
        }
        Instant now = clock.instant();
        invites.deleteExpiredBefore(now.minus(Duration.ofDays(2)));
        invites.invalidateForEmail(hash, now);
        byte[] b = new byte[32];
        random.nextBytes(b);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        invites.save(new AdminInvite(UUID.randomUUID(), hash, cipher.encrypt(email), RefreshTokenService.hash(raw),
                invitedBy, now, now.plus(INVITE_TTL)));
        String base = props.appBaseUrl().replaceAll("/+$", "");
        emails.send(email, EmailSender.Kind.ADMIN_INVITE, base + "/admin/accept?token=" + raw);
        log.info("Admin invite issued by {}", invitedBy);
    }

    @Transactional
    public void revokeInvite(UUID inviteId) {
        if (invites.invalidate(inviteId, clock.instant()) != 1) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Not Found", "No such pending invite");
        }
    }

    /**
     * The invitee proves who they are with the password of the account registered under the invited address.
     * Their old sessions are revoked so no earlier refresh token can turn into an admin session.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public void accept(Dtos.AcceptInviteRequest req) {
        User user = credentials.authenticate(new Dtos.LoginRequest(req.email(), req.password()));
        String hash = RefreshTokenService.hash(req.token());
        AdminInvite invite = invites.findByTokenHash(hash).orElseThrow(() -> ApiException.badRequest(BAD_INVITE));
        if (!invite.getEmailHash().equals(user.getEmailHash()) || invites.consume(hash, clock.instant()) != 1) {
            throw ApiException.badRequest(BAD_INVITE);
        }
        user.addRole("ADMIN");
        users.save(user);
        refreshTokens.revokeAllForUser(user.getId());
        log.info("Admin role granted to {}", user.getId());
    }

    /** Removes an explicitly granted ADMIN. The main admin (configuration) cannot be removed, nor can you remove yourself. */
    @Transactional
    public void remove(UUID actorId, UUID targetId) {
        if (actorId.equals(targetId)) {
            throw ApiException.badRequest("You cannot remove yourself");
        }
        User target = users.findById(targetId).filter(User::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not Found", "No such administrator"));
        if (roles.isMainAdmin(target)) {
            throw ApiException.badRequest("The main admin cannot be removed");
        }
        if (!Arrays.asList(target.getRoles()).contains("ADMIN")) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Not Found", "No such administrator");
        }
        target.removeRole("ADMIN");
        users.save(target);
        refreshTokens.revokeAllForUser(targetId);
        log.info("Admin role removed from {} by {}", targetId, actorId);
    }
}
