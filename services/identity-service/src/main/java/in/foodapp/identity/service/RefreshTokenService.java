package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.config.AppProperties;
import in.foodapp.identity.persistence.RefreshToken;
import in.foodapp.identity.persistence.RefreshTokenRepository;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {

    /** A freshly issued raw refresh token (never stored) for a user; adminSession is carried over on rotation. */
    public record Issued(User user, String rawToken, boolean adminSession) {
        public Issued(User user, String rawToken) {
            this(user, rawToken, false);
        }
    }

    private final RefreshTokenRepository tokens;
    private final UserRepository users;
    private final AppProperties props;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokens, UserRepository users, AppProperties props,
                               Clock clock) {
        this.tokens = tokens;
        this.users = users;
        this.props = props;
        this.clock = clock;
    }

    public static String hash(String raw) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private String newRaw() {
        byte[] b = new byte[32];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    /** Starts a new token family for a user (login). */
    @Transactional
    public String issueNewFamily(UUID userId) {
        return create(userId, UUID.randomUUID(), null, false).rawToken();
    }

    /** Starts a family for the admin sign-in; only these may later be refreshed into admin tokens. */
    @Transactional
    public String issueNewAdminFamily(UUID userId) {
        return create(userId, UUID.randomUUID(), null, true).rawToken();
    }

    private Created create(UUID userId, UUID familyId, RefreshToken previous, boolean adminSession) {
        Instant now = clock.instant();
        String raw = newRaw();
        RefreshToken t = new RefreshToken(UUID.randomUUID(), userId, hash(raw), familyId,
                now.plus(props.refresh().ttlDays(), ChronoUnit.DAYS), now);
        t.setAdminSession(adminSession);
        tokens.save(t);
        if (previous != null) {
            previous.setRevoked(true);
            previous.setReplacedBy(t.getId());
            tokens.save(previous);
        }
        return new Created(raw);
    }

    private record Created(String rawToken) {
    }

    /**
     * Rotates a refresh token. Presenting an already-revoked (used) token is treated as theft: the whole
     * family is revoked. The revocation must commit even though we throw, hence noRollbackFor.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Issued rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw ApiException.unauthorized("Invalid refresh token");
        }
        RefreshToken current = tokens.findByTokenHashForUpdate(hash(rawToken))
                .orElseThrow(() -> ApiException.unauthorized("Invalid refresh token"));
        if (current.isRevoked()) {
            tokens.revokeFamily(current.getFamilyId());
            throw ApiException.unauthorized("Refresh token reuse detected");
        }
        if (!current.getExpiresAt().isAfter(clock.instant())) {
            throw ApiException.unauthorized("Refresh token expired");
        }
        Optional<User> user = users.findById(current.getUserId());
        if (user.isEmpty() || !user.get().isActive()) {
            tokens.revokeFamily(current.getFamilyId());
            throw ApiException.unauthorized("Invalid refresh token");
        }
        Created created = create(current.getUserId(), current.getFamilyId(), current, current.isAdminSession());
        return new Issued(user.get(), created.rawToken(), current.isAdminSession());
    }

    /** Revokes the family of the presented token (logout). Unknown tokens are ignored (idempotent). */
    @Transactional
    public void revokeFamilyOf(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        tokens.findByTokenHashForUpdate(hash(rawToken))
                .ifPresent(t -> tokens.revokeFamily(t.getFamilyId()));
    }

    @Transactional
    public void revokeAllForUser(UUID userId) {
        tokens.revokeAllForUser(userId);
    }
}
