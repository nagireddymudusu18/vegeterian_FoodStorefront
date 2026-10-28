package in.foodapp.identity.service;

import in.foodapp.identity.persistence.EmailToken;
import in.foodapp.identity.persistence.EmailTokenRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Issues and redeems single-use email links (verification and password reset). */
@Service
public class EmailTokenService {

    public static final String VERIFY = "VERIFY";
    public static final String RESET = "RESET";
    private static final Duration VERIFY_TTL = Duration.ofHours(24);
    private static final Duration RESET_TTL = Duration.ofMinutes(30);

    private final EmailTokenRepository tokens;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public EmailTokenService(EmailTokenRepository tokens, Clock clock) {
        this.tokens = tokens;
        this.clock = clock;
    }

    /** Issues a fresh token and invalidates the user's earlier ones for the same purpose. */
    @Transactional
    public String issue(UUID userId, String purpose) {
        Instant now = clock.instant();
        tokens.deleteExpiredBefore(now.minus(Duration.ofDays(2)));
        tokens.invalidateAll(userId, purpose, now);
        byte[] b = new byte[32];
        random.nextBytes(b);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        Duration ttl = VERIFY.equals(purpose) ? VERIFY_TTL : RESET_TTL;
        tokens.save(new EmailToken(UUID.randomUUID(), userId, purpose, RefreshTokenService.hash(raw),
                now.plus(ttl), now));
        return raw;
    }

    /** Redeems a token; the owner's id when it was valid, unused and unexpired. */
    @Transactional
    public Optional<UUID> redeem(String raw, String purpose) {
        if (raw == null || raw.isBlank() || raw.length() > 100) {
            return Optional.empty();
        }
        String hash = RefreshTokenService.hash(raw);
        if (tokens.consume(hash, purpose, clock.instant()) != 1) {
            return Optional.empty();
        }
        return tokens.findUserIdByHash(hash);
    }

    @Transactional
    public void invalidateAll(UUID userId, String purpose) {
        tokens.invalidateAll(userId, purpose, clock.instant());
    }
}
