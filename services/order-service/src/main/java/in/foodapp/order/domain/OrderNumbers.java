package in.foodapp.order.domain;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Optional;

/** Generates and parses public order numbers: "FA-XXXXX-XXXXX", 10 Crockford-base32 characters (50 bits). */
public final class OrderNumbers {

    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final int LENGTH = 10;
    private static final String PREFIX = "FA";
    private static final SecureRandom RANDOM = new SecureRandom();

    private OrderNumbers() {
    }

    /** Raw stored form, e.g. "7K3M9QX2RA". */
    public static String generate() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    /** Display form, e.g. "FA-7K3M9-QX2RA". */
    public static String display(String raw) {
        return PREFIX + "-" + raw.substring(0, 5) + "-" + raw.substring(5);
    }

    /** Accepts any case, dashes or spaces, with or without the FA prefix. Empty if it cannot be a valid number. */
    public static Optional<String> parse(String input) {
        if (input == null || input.length() > 32) {
            return Optional.empty();
        }
        String s = input.toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        if (s.length() == LENGTH + PREFIX.length() && s.startsWith(PREFIX)) {
            s = s.substring(PREFIX.length());
        }
        if (s.length() != LENGTH) {
            return Optional.empty();
        }
        // Crockford aliases for easy typing
        s = s.replace('O', '0').replace('I', '1').replace('L', '1');
        for (int i = 0; i < s.length(); i++) {
            if (ALPHABET.indexOf(s.charAt(i)) < 0) {
                return Optional.empty();
            }
        }
        return Optional.of(s);
    }
}
