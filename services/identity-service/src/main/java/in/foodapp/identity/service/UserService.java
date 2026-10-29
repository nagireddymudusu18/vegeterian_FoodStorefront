package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.api.Dtos;
import in.foodapp.identity.events.OutboxService;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.persistence.Consent;
import in.foodapp.identity.persistence.ConsentRepository;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Account lifecycle: phone sign-in and sign-up, profile, consent, partner and owner roles, erasure. */
@Service
public class UserService {

    private final UserRepository users;
    private final ConsentRepository consents;
    private final OtpService otp;
    private final RefreshTokenService refreshTokens;
    private final OutboxService outbox;
    private final PiiCipher cipher;
    private final Clock clock;
    private final RoleResolver roles;
    private final TokenIssuer tokens;

    public UserService(UserRepository users, ConsentRepository consents, OtpService otp,
                       RefreshTokenService refreshTokens, OutboxService outbox, PiiCipher cipher,
                       Clock clock, RoleResolver roles, TokenIssuer tokens) {
        this.users = users;
        this.consents = consents;
        this.otp = otp;
        this.refreshTokens = refreshTokens;
        this.outbox = outbox;
        this.cipher = cipher;
        this.clock = clock;
        this.roles = roles;
        this.tokens = tokens;
    }

    /**
     * Runs after the OTP code was verified: consumes the challenge, creates the user on first login
     * (consent required), records consent, and issues tokens, all in one transaction.
     */
    @Transactional
    public Dtos.TokenResponse completeLogin(String e164Phone, UUID challengeId, Dtos.ConsentInput consent,
                                            String name, String ip) {
        if (!otp.consume(challengeId)) {
            throw ApiException.unauthorized("Invalid or expired code");
        }
        Instant now = clock.instant();
        String phoneHash = otp.phoneHash(e164Phone);
        Optional<User> existing = users.findByPhoneHash(phoneHash);
        User user;
        if (existing.isPresent()) {
            user = existing.get();
            if (roles.isAdmin(user)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Use the admin sign-in",
                        "Administrator accounts sign in with email and password on the admin page");
            }
        } else {
            if (consent == null || !consent.granted()) {
                throw ApiException.badRequest("Consent must be granted to create an account");
            }
            user = users.save(new User(UUID.randomUUID(), cipher.encrypt(e164Phone), phoneHash,
                    new String[]{"CUSTOMER"}, now));
            outbox.publish("UserRegistered", user.getId(), Map.of("userId", user.getId().toString()));
        }
        if (name != null && !name.isBlank() && user.getNameEnc() == null) {
            user.setName(cipher.encrypt(name.trim()));
            users.save(user);
        }
        if (consent != null) {
            consents.save(new Consent(UUID.randomUUID(), user.getId(), consent.purpose(), consent.version(),
                    consent.granted(), now, ip));
        }
        String refresh = refreshTokens.issueNewFamily(user.getId());
        return tokens.tokenResponse(user, refresh);
    }

    @Transactional(readOnly = true)
    public Dtos.MeResponse me(UUID userId) {
        User user = activeUser(userId);
        String phone = user.getPhoneEnc() == null ? null : PhoneNormalizer.mask(cipher.decrypt(user.getPhoneEnc()));
        String name = user.getNameEnc() == null ? null : cipher.decrypt(user.getNameEnc());
        String email = user.getEmailEnc() == null ? null
                : PasswordService.maskEmail(cipher.decrypt(user.getEmailEnc()));
        return new Dtos.MeResponse(user.getId(), name, phone, email, user.isEmailVerified(),
                user.getPasswordHash() != null, roles.rolesOf(user), user.getStatus(), user.getCreatedAt());
    }

    /** Gives the account the PARTNER (delivery) role. Needs a verified phone so riders are reachable. */
    @Transactional
    public void enrollPartner(UUID userId) {
        User user = activeUser(userId);
        if (user.getPhoneHash() == null) {
            throw ApiException.badRequest("Add and verify a phone number before becoming a delivery partner");
        }
        user.addRole("PARTNER");
        users.save(user);
    }

    /** Admin action: gives the account registered with this email the RESTAURANT role; returns its user id. */
    @Transactional
    public UUID grantRestaurantRole(String email) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        User user = users.findByEmailHash(cipher.blindIndex("email:" + normalized)).filter(User::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not Found", "No account with that email"));
        if (!user.isEmailVerified()) {
            throw ApiException.badRequest("That account has not verified its email yet");
        }
        user.addRole("RESTAURANT");
        users.save(user);
        return user.getId();
    }

    /** Adds a phone number to an account (e.g. one created by email) after its OTP was verified. */
    @Transactional
    public void addPhone(UUID userId, String e164Phone, UUID challengeId) {
        if (!otp.consume(challengeId)) {
            throw ApiException.unauthorized("Invalid or expired code");
        }
        User user = activeUser(userId);
        if (user.getPhoneHash() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "Conflict", "This account already has a phone number");
        }
        String hash = otp.phoneHash(e164Phone);
        if (users.findByPhoneHash(hash).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "Conflict",
                    "This phone number is already used by another account");
        }
        user.setPhone(cipher.encrypt(e164Phone), hash);
        users.save(user);
    }

    @Transactional
    public void recordConsent(UUID userId, Dtos.ConsentInput input, String ip) {
        User user = activeUser(userId);
        consents.save(new Consent(UUID.randomUUID(), user.getId(), input.purpose(), input.version(),
                input.granted(), clock.instant(), ip));
    }

    /** DPDP erasure: wipe phone data, mark DELETED, revoke tokens, emit UserDeleted. */
    @Transactional
    public void delete(UUID userId) {
        refreshTokens.revokeAllForUser(userId);
        User user = activeUser(userId);
        user.markDeleted(clock.instant());
        users.save(user);
        outbox.publish("UserDeleted", userId, Map.of("userId", userId.toString()));
    }

    private User activeUser(UUID userId) {
        return users.findById(userId)
                .filter(User::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not Found", "User not found"));
    }
}
