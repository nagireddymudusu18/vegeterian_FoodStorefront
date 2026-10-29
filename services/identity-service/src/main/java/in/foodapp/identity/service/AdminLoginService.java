package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.api.Dtos;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.infra.email.EmailSender;
import in.foodapp.identity.persistence.AdminLoginCode;
import in.foodapp.identity.persistence.AdminLoginCodeRepository;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The email-only admin sign-in: password, plus an emailed code while the {@code admin_login_code} flag is on.
 */
@Service
public class AdminLoginService {

    static final Duration CODE_TTL = Duration.ofMinutes(10);
    static final int MAX_CODE_ATTEMPTS = 5;
    private static final String BAD_CODE = "Invalid or expired code";

    private final CredentialService credentials;
    private final RoleResolver roles;
    private final TokenIssuer tokens;
    private final RefreshTokenService refreshTokens;
    private final FeatureFlagService flags;
    private final UserRepository users;
    private final AdminLoginCodeRepository codes;
    private final PiiCipher cipher;
    private final EmailSender emails;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AdminLoginService(CredentialService credentials, RoleResolver roles, TokenIssuer tokens,
                             RefreshTokenService refreshTokens, FeatureFlagService flags, UserRepository users,
                             AdminLoginCodeRepository codes, PiiCipher cipher, EmailSender emails, Clock clock) {
        this.credentials = credentials;
        this.roles = roles;
        this.tokens = tokens;
        this.refreshTokens = refreshTokens;
        this.flags = flags;
        this.users = users;
        this.codes = codes;
        this.cipher = cipher;
        this.emails = emails;
        this.clock = clock;
    }

    private String codeHash(UUID challengeId, String code) {
        return cipher.blindIndex("admincode:" + challengeId + ":" + code);
    }

    private Dtos.TokenResponse adminTokens(User user) {
        return tokens.tokenResponse(user, refreshTokens.issueNewAdminFamily(user.getId()));
    }

    /** Failed attempts must persist, so ApiException does not roll back. */
    @Transactional(noRollbackFor = ApiException.class)
    public Dtos.AdminLoginResponse login(Dtos.LoginRequest req) {
        User user = credentials.authenticate(req);
        if (!roles.isAdmin(user)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Forbidden", "This account is not an administrator");
        }
        if (!flags.isEnabled("admin_login_code")) {
            return new Dtos.AdminLoginResponse(adminTokens(user), null);
        }
        Instant now = clock.instant();
        codes.deleteExpiredBefore(now.minus(Duration.ofDays(1)));
        codes.invalidateAll(user.getId(), now);
        UUID challengeId = UUID.randomUUID();
        String code = String.format("%06d", random.nextInt(1_000_000));
        codes.save(new AdminLoginCode(challengeId, user.getId(), codeHash(challengeId, code), now,
                now.plus(CODE_TTL)));
        emails.send(cipher.decrypt(user.getEmailEnc()), EmailSender.Kind.ADMIN_LOGIN_CODE, code);
        return new Dtos.AdminLoginResponse(null, challengeId);
    }

    /** Counts the attempt before comparing, so wrong guesses are limited even though we throw. */
    @Transactional(noRollbackFor = ApiException.class)
    public Dtos.TokenResponse verifyCode(UUID challengeId, String code) {
        AdminLoginCode c = codes.lockById(challengeId).orElseThrow(() -> ApiException.unauthorized(BAD_CODE));
        Instant now = clock.instant();
        if (c.isUsed() || !c.getExpiresAt().isAfter(now) || c.getAttempts() >= MAX_CODE_ATTEMPTS) {
            throw ApiException.unauthorized(BAD_CODE);
        }
        c.incrementAttempts();
        codes.save(c);
        byte[] expected = c.getCodeHash().getBytes(StandardCharsets.UTF_8);
        byte[] actual = codeHash(challengeId, code == null ? "" : code.trim()).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual) || codes.consume(challengeId, now) != 1) {
            throw ApiException.unauthorized(BAD_CODE);
        }
        User user = users.findById(c.getUserId()).filter(User::isActive).filter(roles::isAdmin)
                .orElseThrow(() -> ApiException.unauthorized(BAD_CODE));
        return adminTokens(user);
    }
}
