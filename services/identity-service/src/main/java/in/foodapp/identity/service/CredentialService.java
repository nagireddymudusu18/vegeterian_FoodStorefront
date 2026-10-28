package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.api.Dtos;
import in.foodapp.identity.config.AppProperties;
import in.foodapp.identity.events.OutboxService;
import in.foodapp.identity.infra.email.EmailSender;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.persistence.Consent;
import in.foodapp.identity.persistence.ConsentRepository;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Email + password registration and login, as an alternative to phone OTP. */
@Service
public class CredentialService {

    static final int MAX_FAILED_LOGINS = 5;
    static final Duration LOCK_FOR = Duration.ofMinutes(15);
    private static final String INVALID = "Invalid email or password";

    private final UserRepository users;
    private final ConsentRepository consents;
    private final PasswordService passwords;
    private final UserService userService;
    private final RefreshTokenService refreshTokens;
    private final OutboxService outbox;
    private final PiiCipher cipher;
    private final Clock clock;
    private final EmailTokenService emailTokens;
    private final EmailSender emails;
    private final AppProperties props;

    public CredentialService(UserRepository users, ConsentRepository consents, PasswordService passwords,
                             UserService userService, RefreshTokenService refreshTokens, OutboxService outbox,
                             PiiCipher cipher, Clock clock, EmailTokenService emailTokens, EmailSender emails,
                             AppProperties props) {
        this.users = users;
        this.consents = consents;
        this.passwords = passwords;
        this.userService = userService;
        this.refreshTokens = refreshTokens;
        this.outbox = outbox;
        this.cipher = cipher;
        this.clock = clock;
        this.emailTokens = emailTokens;
        this.emails = emails;
        this.props = props;
    }

    private String emailHash(String email) {
        return cipher.blindIndex("email:" + email);
    }

    private String link(String path, String token) {
        String base = props.appBaseUrl().replaceAll("/+$", "");
        return token == null ? base + path : base + path + "?token=" + token;
    }

    private void sendVerification(User user, String email) {
        emails.send(email, EmailSender.Kind.VERIFY_EMAIL,
                link("/verify-email", emailTokens.issue(user.getId(), EmailTokenService.VERIFY)));
    }

    /**
     * Creates the account and emails a verification link. The caller always gets the same answer, whether or
     * not the address is already registered, so this endpoint cannot be used to discover who has an account.
     */
    @Transactional
    public void register(Dtos.RegisterRequest req, String ip) {
        String name = req.name().trim();
        if (name.isEmpty()) {
            throw ApiException.badRequest("Name is required");
        }
        if (req.consent() == null || !req.consent().granted()) {
            throw ApiException.badRequest("Consent must be granted to create an account");
        }
        String email = passwords.normaliseEmail(req.email());
        passwords.validate(req.password(), email);
        String hash = emailHash(email);
        String passwordHash = passwords.hash(req.password());
        Instant now = clock.instant();

        User existing = users.findByEmailHash(hash).orElse(null);
        if (existing != null && !existing.isEmailVerified()) {
            if (existing.getPhoneHash() == null) {
                // An abandoned or squatted sign-up: the newest request wins, and older links stop working.
                existing.setName(cipher.encrypt(name));
                existing.setCredentials(cipher.encrypt(email), hash, passwordHash);
                users.save(existing);
                sendVerification(existing, email);
                return;
            }
            // An unverified claim on a phone account must not block the real owner of the address.
            existing.clearEmail();
            users.saveAndFlush(existing);
            emailTokens.invalidateAll(existing.getId(), EmailTokenService.VERIFY);
            emailTokens.invalidateAll(existing.getId(), EmailTokenService.RESET);
            existing = null;
        }
        if (existing != null) {
            emails.send(email, EmailSender.Kind.ALREADY_REGISTERED, link("/login", null));
            return;
        }

        User user = new User(UUID.randomUUID(), null, null, new String[]{"CUSTOMER"}, now);
        user.setName(cipher.encrypt(name));
        user.setCredentials(cipher.encrypt(email), hash, passwordHash);
        users.saveAndFlush(user);
        outbox.publish("UserRegistered", user.getId(), Map.of("userId", user.getId().toString()));
        Dtos.ConsentInput c = req.consent();
        consents.save(new Consent(UUID.randomUUID(), user.getId(), c.purpose(), c.version(), c.granted(), now, ip));
        sendVerification(user, email);
    }

    /** Redeems a verification link: marks the email verified and signs the user in. */
    @Transactional
    public Dtos.TokenResponse verifyEmail(String token, String password) {
        UUID userId = emailTokens.redeem(token, EmailTokenService.VERIFY)
                .orElseThrow(() -> ApiException.badRequest("This link is invalid or has expired"));
        User user = users.findById(userId).filter(User::isActive)
                .orElseThrow(() -> ApiException.badRequest("This link is invalid or has expired"));
        // Someone else may have signed up with this address and their own password; the link alone must not
        // hand the account over, so the person verifying has to know the password it was registered with.
        if (user.getEmailHash() == null || !passwords.matches(password, user.getPasswordHash())) {
            throw ApiException.unauthorized("Incorrect password");
        }
        user.markEmailVerified();
        users.save(user);
        return userService.tokenResponse(user, refreshTokens.issueNewFamily(user.getId()));
    }

    /** Sends a fresh verification link if the address is registered and unverified; says nothing either way. */
    @Transactional
    public void resendVerification(String rawEmail) {
        String email = passwords.normaliseEmail(rawEmail);
        users.findByEmailHash(emailHash(email))
                .filter(u -> u.isActive() && !u.isEmailVerified())
                .ifPresent(u -> sendVerification(u, email));
    }

    /** Sends a reset link if the address belongs to an account; says nothing either way. */
    @Transactional
    public void forgotPassword(String rawEmail) {
        String email = passwords.normaliseEmail(rawEmail);
        users.findByEmailHash(emailHash(email)).filter(User::isActive).ifPresent(u ->
                emails.send(email, EmailSender.Kind.RESET_PASSWORD,
                        link("/reset-password", emailTokens.issue(u.getId(), EmailTokenService.RESET))));
    }

    /**
     * Sets a new password from a reset link. A weak password rolls the transaction back, so the link is not
     * burned. Owning the link proves ownership of the address, so it also verifies it; all sessions end.
     */
    @Transactional
    public void resetPassword(String token, String newPassword) {
        UUID userId = emailTokens.redeem(token, EmailTokenService.RESET)
                .orElseThrow(() -> ApiException.badRequest("This link is invalid or has expired"));
        User user = users.findById(userId).filter(User::isActive)
                .orElseThrow(() -> ApiException.badRequest("This link is invalid or has expired"));
        if (user.getEmailHash() == null) {
            throw ApiException.badRequest("This link is invalid or has expired");
        }
        String email = cipher.decrypt(user.getEmailEnc());
        passwords.validate(newPassword, email);
        user.setPasswordHash(passwords.hash(newPassword));
        user.markEmailVerified();
        user.recordSuccessfulLogin();
        users.save(user);
        refreshTokens.revokeAllForUser(userId);
    }


    /** Failed attempts must persist, so ApiException does not roll back. */
    @Transactional(noRollbackFor = ApiException.class)
    public Dtos.TokenResponse login(Dtos.LoginRequest req) {
        String email = passwords.normaliseEmail(req.email());
        User user = users.lockByEmailHash(emailHash(email)).filter(User::isActive).orElse(null);
        Instant now = clock.instant();
        boolean ok = passwords.matches(req.password(), user == null ? null : user.getPasswordHash());
        if (user == null) {
            throw ApiException.unauthorized(INVALID);
        }
        if (user.isLocked(now)) {
            throw ApiException.tooManyRequests("Too many failed attempts. Please try again later.");
        }
        if (!ok) {
            user.recordFailedLogin(now, MAX_FAILED_LOGINS, LOCK_FOR);
            users.save(user);
            throw ApiException.unauthorized(INVALID);
        }
        user.recordSuccessfulLogin();
        users.save(user);
        // Only reached with the right password, so this does not reveal which addresses are registered.
        if (!user.isEmailVerified()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Email not verified",
                    "Please verify your email address. Check your inbox for the link.");
        }
        return userService.tokenResponse(user, refreshTokens.issueNewFamily(user.getId()));
    }

    /**
     * Lets an account created via phone OTP add an email + password so it can also sign in that way. The email
     * must be verified before it can be used to sign in. If the address already belongs to someone else the
     * caller still gets 204, and the address's owner is told by email instead.
     */
    @Transactional
    public void addCredentials(UUID userId, Dtos.CredentialsRequest req) {
        User user = users.findById(userId).filter(User::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not Found", "User not found"));
        if (user.getPasswordHash() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "Conflict", "This account already has a password");
        }
        String email = passwords.normaliseEmail(req.email());
        passwords.validate(req.password(), email);
        String hash = emailHash(email);
        User other = users.findByEmailHash(hash).orElse(null);
        if (other != null && !other.isEmailVerified() && other.getPhoneHash() != null) {
            other.clearEmail();
            users.saveAndFlush(other);
            other = null;
        }
        if (other != null) {
            emails.send(email, EmailSender.Kind.ALREADY_REGISTERED, link("/login", null));
            return;
        }
        user.setCredentials(cipher.encrypt(email), hash, passwords.hash(req.password()));
        users.saveAndFlush(user);
        sendVerification(user, email);
    }
}
