package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.config.AppProperties;
import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.infra.sms.CaptchaVerifier;
import in.foodapp.identity.infra.sms.SmsSender;
import in.foodapp.identity.persistence.OtpChallenge;
import in.foodapp.identity.persistence.OtpChallengeRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OtpService {

    private final OtpChallengeRepository challenges;
    private final PiiCipher cipher;
    private final SmsSender smsSender;
    private final CaptchaVerifier captcha;
    private final PhoneNormalizer phones;
    private final AppProperties props;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public OtpService(OtpChallengeRepository challenges, PiiCipher cipher, SmsSender smsSender,
                      CaptchaVerifier captcha, PhoneNormalizer phones, AppProperties props, Clock clock) {
        this.challenges = challenges;
        this.cipher = cipher;
        this.smsSender = smsSender;
        this.captcha = captcha;
        this.phones = phones;
        this.props = props;
        this.clock = clock;
    }

    public String phoneHash(String e164) {
        return cipher.blindIndex("phone:" + e164);
    }

    private String codeHash(String phoneHash, String code) {
        return cipher.blindIndex("otp:" + phoneHash + ":" + code);
    }

    /** Issues and sends an OTP. Behaves identically whether or not a user exists for the phone. */
    @Transactional
    public void request(String rawPhone, String clientIp, String captchaToken) {
        if (!captcha.verify(captchaToken, clientIp)) {
            throw ApiException.badRequest("Captcha verification failed");
        }
        String phone = phones.normalise(rawPhone);
        String phoneHash = phoneHash(phone);
        Instant now = clock.instant();
        AppProperties.Otp cfg = props.otp();

        Instant phoneSince = now.minusSeconds(cfg.phoneWindowSeconds());
        if (challenges.countByPhoneHashAndCreatedAtAfter(phoneHash, phoneSince) >= cfg.phoneMaxRequests()) {
            throw ApiException.tooManyRequests("Too many OTP requests. Please try again later.");
        }
        if (clientIp != null && !clientIp.isBlank()) {
            Instant ipSince = now.minusSeconds(cfg.ipWindowSeconds());
            if (challenges.countByRequestIpAndCreatedAtAfter(clientIp, ipSince) >= cfg.ipMaxRequests()) {
                throw ApiException.tooManyRequests("Too many OTP requests. Please try again later.");
            }
        }

        challenges.deleteOlderThan(now.minus(Duration.ofDays(1)));
        challenges.consumeAllForPhone(phoneHash);

        String code = String.format("%06d", random.nextInt(1_000_000));
        OtpChallenge challenge = new OtpChallenge(UUID.randomUUID(), phoneHash, codeHash(phoneHash, code),
                now.plusSeconds(cfg.ttlSeconds()), now, clientIp == null || clientIp.isBlank() ? null : clientIp);
        challenges.save(challenge);
        smsSender.sendOtp(phone, code);
    }

    /**
     * Counts an attempt against the latest active challenge and compares the code in constant time.
     * Returns the challenge id when the code is correct (the challenge is consumed later, atomically,
     * by {@link #consume(UUID)}); empty on any failure. Does not throw so the attempt counter commits.
     */
    @Transactional
    public Optional<UUID> check(String e164Phone, String code) {
        String phoneHash = phoneHash(e164Phone);
        List<OtpChallenge> active = challenges.lockActiveByPhoneHash(phoneHash, PageRequest.of(0, 1));
        if (active.isEmpty()) {
            return Optional.empty();
        }
        OtpChallenge c = active.get(0);
        Instant now = clock.instant();
        if (!c.getExpiresAt().isAfter(now) || c.getAttempts() >= props.otp().maxAttempts()) {
            return Optional.empty();
        }
        c.incrementAttempts();
        challenges.save(c);
        byte[] expected = c.getCodeHash().getBytes(StandardCharsets.UTF_8);
        byte[] actual = codeHash(phoneHash, code == null ? "" : code).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual) ? Optional.of(c.getId()) : Optional.empty();
    }

    /** Atomically marks the challenge consumed; false if someone else already did. */
    @Transactional
    public boolean consume(UUID challengeId) {
        return challenges.consume(challengeId) == 1;
    }
}
