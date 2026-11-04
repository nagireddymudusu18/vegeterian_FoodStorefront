package in.foodapp.identity.infra.email;

/** Sends transactional email. Implementations must not log or persist anything beyond what delivery needs. */
public interface EmailSender {

    enum Kind { VERIFY_EMAIL, RESET_PASSWORD, ALREADY_REGISTERED, ADMIN_INVITE, ADMIN_LOGIN_CODE }

    /**
     * @param link the one-time link the recipient should open (a sign-in link for ALREADY_REGISTERED);
     *             for ADMIN_LOGIN_CODE it is the 6-digit code itself.
     */
    void send(String to, Kind kind, String link);
}
