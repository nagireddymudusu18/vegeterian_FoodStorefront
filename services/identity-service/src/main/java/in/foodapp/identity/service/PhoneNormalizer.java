package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Validates Indian mobile numbers and normalises them to E.164 (+91XXXXXXXXXX). */
@Component
public class PhoneNormalizer {

    private static final Pattern NATIONAL = Pattern.compile("[6-9][0-9]{9}");

    public String normalise(String raw) {
        if (raw == null) {
            throw ApiException.badRequest("Invalid Indian mobile number");
        }
        String s = raw.trim().replaceAll("[\\s\\-()]", "");
        String national;
        if (s.startsWith("+91")) {
            national = s.substring(3);
        } else if (s.startsWith("+")) {
            throw ApiException.badRequest("Only Indian (+91) mobile numbers are supported");
        } else if (s.length() == 12 && s.startsWith("91")) {
            national = s.substring(2);
        } else if (s.length() == 11 && s.startsWith("0")) {
            national = s.substring(1);
        } else {
            national = s;
        }
        if (!NATIONAL.matcher(national).matches()) {
            throw ApiException.badRequest("Invalid Indian mobile number");
        }
        return "+91" + national;
    }

    /** +919876543210 -> +91XXXXXX3210 */
    public static String mask(String e164) {
        if (e164 == null || e164.length() < 4) {
            return "";
        }
        String last4 = e164.substring(e164.length() - 4);
        return "+91XXXXXX" + last4;
    }
}
