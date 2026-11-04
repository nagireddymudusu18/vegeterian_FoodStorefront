package in.foodapp.notification.infra;

/** Hides most of a phone number or email address before it is written to a log. */
public final class Masking {

    private Masking() {
    }

    public static String phone(String phone) {
        if (phone == null || phone.length() <= 4) {
            return "****";
        }
        return "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
    }

    public static String email(String email) {
        if (email == null) {
            return "****";
        }
        int at = email.indexOf('@');
        if (at <= 1) {
            return "****" + (at < 0 ? "" : email.substring(at));
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
