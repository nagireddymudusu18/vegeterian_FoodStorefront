package in.foodapp.identity.service;

import in.foodapp.identity.api.Dtos;
import in.foodapp.identity.infra.jwt.JwtService;
import in.foodapp.identity.persistence.User;
import java.util.List;
import org.springframework.stereotype.Service;

/** Builds the token response for a sign-in, deciding whether administrator roles go into the access token. */
@Service
public class TokenIssuer {

    private final JwtService jwt;
    private final RoleResolver roles;

    public TokenIssuer(JwtService jwt, RoleResolver roles) {
        this.jwt = jwt;
        this.roles = roles;
    }

    /** All of the account's roles; only for the admin sign-in and for non-admin accounts. */
    public Dtos.TokenResponse tokenResponse(User user, String rawRefreshToken) {
        String access = jwt.issueAccessToken(user.getId(), roles.rolesOf(user));
        return new Dtos.TokenResponse(access, rawRefreshToken, jwt.accessTtlSeconds());
    }

    /** For sign-in paths that are not the admin sign-in: administrator roles are left out of the token. */
    public Dtos.TokenResponse customerTokenResponse(User user, String rawRefreshToken) {
        List<String> granted = roles.rolesOf(user);
        granted.removeIf(r -> r.equals("ADMIN") || r.equals("SUPER_ADMIN"));
        return new Dtos.TokenResponse(jwt.issueAccessToken(user.getId(), granted), rawRefreshToken,
                jwt.accessTtlSeconds());
    }

    /** Refresh of an admin-session token keeps the admin roles; any other family gets customer roles only. */
    public Dtos.TokenResponse forRefresh(RefreshTokenService.Issued issued) {
        return issued.adminSession()
                ? tokenResponse(issued.user(), issued.rawToken())
                : customerTokenResponse(issued.user(), issued.rawToken());
    }
}
