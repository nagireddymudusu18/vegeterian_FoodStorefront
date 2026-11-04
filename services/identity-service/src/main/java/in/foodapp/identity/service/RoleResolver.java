package in.foodapp.identity.service;

import in.foodapp.identity.infra.crypto.PiiCipher;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Decides which roles an account actually has, including the main admin taken from configuration. */
@Service
public class RoleResolver {

    private final UserRepository users;
    private final String mainAdminHash;

    public RoleResolver(UserRepository users, PiiCipher cipher,
                        @Value("${app.main-admin-email:}") String mainAdminEmail) {
        this.users = users;
        String main = mainAdminEmail == null ? "" : mainAdminEmail.trim().toLowerCase(Locale.ROOT);
        this.mainAdminHash = main.isEmpty() ? null : cipher.blindIndex("email:" + main);
    }

    public boolean isMainAdmin(User user) {
        return mainAdminHash != null && mainAdminHash.equals(user.getEmailHash());
    }

    public Optional<User> mainAdmin() {
        return mainAdminHash == null ? Optional.empty() : users.findByEmailHash(mainAdminHash).filter(User::isActive);
    }

    /**
     * Stored roles, plus ADMIN and SUPER_ADMIN for the main admin (APP_MAIN_ADMIN_EMAIL). Admin roles only count
     * for accounts that signed up with a verified email and password; SUPER_ADMIN is never read from the database.
     */
    public List<String> rolesOf(User user) {
        List<String> roles = new ArrayList<>(List.of(user.getRoles()));
        roles.removeIf("SUPER_ADMIN"::equals);
        boolean emailAccount = user.isEmailVerified() && user.getEmailHash() != null && user.getPasswordHash() != null;
        if (!emailAccount) {
            roles.removeIf("ADMIN"::equals);
        } else if (isMainAdmin(user)) {
            if (!roles.contains("ADMIN")) {
                roles.add("ADMIN");
            }
            roles.add("SUPER_ADMIN");
        }
        return roles;
    }

    public boolean isAdmin(User user) {
        return rolesOf(user).contains("ADMIN");
    }
}
