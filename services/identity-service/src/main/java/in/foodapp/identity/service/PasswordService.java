package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

/** Password policy and BCrypt hashing, plus email normalisation. */
@Service
public class PasswordService {

    static final int MIN_LENGTH = 8;
    /** BCrypt silently ignores bytes beyond 72, so longer passwords are rejected rather than truncated. */
    static final int MAX_BYTES = 72;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]{1,64}@[^\\s@]+\\.[^\\s@]{2,}$");

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
    /** Verified against when the account does not exist, so response time doesn't reveal which emails exist. */
    private final String dummyHash = encoder.encode("not-a-real-password-1");

    public String hash(String password) {
        return encoder.encode(password);
    }

    public boolean matches(String password, String hash) {
        return encoder.matches(password, hash == null ? dummyHash : hash) && hash != null;
    }

    public void validate(String password, String email) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw ApiException.badRequest("Password must be at least " + MIN_LENGTH + " characters");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw ApiException.badRequest("Password is too long (maximum " + MAX_BYTES + " bytes)");
        }
        if (password.chars().noneMatch(Character::isLetter) || password.chars().noneMatch(Character::isDigit)) {
            throw ApiException.badRequest("Password must contain at least one letter and one digit");
        }
        if (email != null && password.toLowerCase(Locale.ROOT).equals(email)) {
            throw ApiException.badRequest("Password must not be the same as the email");
        }
    }

    /** Trims and lower-cases; rejects anything that is not a plausible email address. */
    public String normaliseEmail(String raw) {
        String email = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !EMAIL.matcher(email).matches()) {
            throw ApiException.badRequest("Enter a valid email address");
        }
        return email;
    }

    public static String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return "*" + email.substring(Math.max(at, 0));
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
