package in.foodapp.identity.api;

import in.foodapp.identity.service.AdminLoginService;
import in.foodapp.identity.service.AdminTeamService;
import in.foodapp.identity.service.AuthRateLimiter;
import in.foodapp.identity.service.CredentialService;
import in.foodapp.identity.service.FeatureFlagService;
import in.foodapp.identity.service.OtpService;
import in.foodapp.identity.service.PhoneNormalizer;
import in.foodapp.identity.service.RefreshTokenService;
import in.foodapp.identity.service.TokenIssuer;
import in.foodapp.identity.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final OtpService otp;
    private final PhoneNormalizer phones;
    private final UserService users;
    private final RefreshTokenService refreshTokens;
    private final CredentialService credentials;
    private final AuthRateLimiter limiter;
    private final FeatureFlagService flags;
    private final AdminLoginService adminLogin;
    private final AdminTeamService adminTeam;
    private final TokenIssuer tokenIssuer;

    public AuthController(OtpService otp, PhoneNormalizer phones, UserService users,
                          RefreshTokenService refreshTokens, CredentialService credentials,
                          AuthRateLimiter limiter, FeatureFlagService flags, AdminLoginService adminLogin,
                          AdminTeamService adminTeam, TokenIssuer tokenIssuer) {
        this.otp = otp;
        this.phones = phones;
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.credentials = credentials;
        this.limiter = limiter;
        this.flags = flags;
        this.adminLogin = adminLogin;
        this.adminTeam = adminTeam;
        this.tokenIssuer = tokenIssuer;
    }

    @PostMapping("/otp/request")
    public ResponseEntity<Dtos.Accepted> requestOtp(@Valid @RequestBody Dtos.OtpRequest body,
                                                    HttpServletRequest request) {
        flags.require("otp_login", "Phone sign-in");
        otp.request(body.phone(), request.getRemoteAddr(), body.captchaToken());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new Dtos.Accepted("If the number is valid, an OTP has been sent"));
    }

    @PostMapping("/otp/verify")
    public Dtos.TokenResponse verifyOtp(@Valid @RequestBody Dtos.OtpVerifyRequest body,
                                        HttpServletRequest request) {
        flags.require("otp_login", "Phone sign-in");
        String phone = phones.normalise(body.phone());
        Optional<UUID> challenge = otp.check(phone, body.code());
        if (challenge.isEmpty()) {
            throw ApiException.unauthorized("Invalid or expired code");
        }
        return users.completeLogin(phone, challenge.get(), body.consent(), body.name(), request.getRemoteAddr());
    }

    @PostMapping("/register")
    public ResponseEntity<Dtos.Accepted> register(@Valid @RequestBody Dtos.RegisterRequest body,
                                                  HttpServletRequest request) {
        flags.require("email_registration", "Creating accounts with email");
        throttle(request, "register", 10);
        credentials.register(body, request.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new Dtos.Accepted("Check your email for a link to verify your address"));
    }

    @PostMapping("/email/verify")
    public Dtos.TokenResponse verifyEmail(@Valid @RequestBody Dtos.TokenRequest body, HttpServletRequest request) {
        throttle(request, "email-verify", 20);
        return credentials.verifyEmail(body.token(), body.password());
    }

    @PostMapping("/email/resend")
    public ResponseEntity<Dtos.Accepted> resend(@Valid @RequestBody Dtos.EmailRequest body,
                                                HttpServletRequest request) {
        throttle(request, "email-resend", 5);
        credentials.resendVerification(body.email());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new Dtos.Accepted("If the address needs verifying, a new link has been sent"));
    }

    @PostMapping("/password/forgot")
    public ResponseEntity<Dtos.Accepted> forgot(@Valid @RequestBody Dtos.EmailRequest body,
                                                HttpServletRequest request) {
        throttle(request, "pw-forgot", 5);
        credentials.forgotPassword(body.email());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new Dtos.Accepted("If an account exists for that address, a reset link has been sent"));
    }

    @PostMapping("/password/reset")
    public ResponseEntity<Void> reset(@Valid @RequestBody Dtos.ResetPasswordRequest body,
                                      HttpServletRequest request) {
        throttle(request, "pw-reset", 10);
        credentials.resetPassword(body.token(), body.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    public Dtos.TokenResponse login(@Valid @RequestBody Dtos.LoginRequest body, HttpServletRequest request) {
        throttle(request, "login", 20);
        return credentials.login(body);
    }

    /** Email + password only. Returns tokens, or a challengeId when an emailed code is also required. */
    @PostMapping("/admin/login")
    public Dtos.AdminLoginResponse adminLogin(@Valid @RequestBody Dtos.LoginRequest body,
                                              HttpServletRequest request) {
        throttle(request, "admin-login", 10);
        return adminLogin.login(body);
    }

    @PostMapping("/admin/login/verify")
    public Dtos.TokenResponse adminLoginVerify(@Valid @RequestBody Dtos.AdminCodeRequest body,
                                               HttpServletRequest request) {
        throttle(request, "admin-code", 10);
        return adminLogin.verifyCode(body.challengeId(), body.code());
    }

    @PostMapping("/admin/invite/accept")
    public ResponseEntity<Void> acceptAdminInvite(@Valid @RequestBody Dtos.AcceptInviteRequest body,
                                                  HttpServletRequest request) {
        throttle(request, "admin-accept", 10);
        adminTeam.accept(body);
        return ResponseEntity.noContent().build();
    }

    private void throttle(HttpServletRequest request, String bucket, int maxPerMinute) {
        if (!limiter.allow(bucket + ":" + request.getRemoteAddr(), maxPerMinute, 60_000,
                System.currentTimeMillis())) {
            throw ApiException.tooManyRequests("Too many attempts. Please try again in a minute.");
        }
    }

    @PostMapping("/refresh")
    public Dtos.TokenResponse refresh(@Valid @RequestBody Dtos.RefreshRequest body) {
        RefreshTokenService.Issued issued = refreshTokens.rotate(body.refreshToken());
        return tokenIssuer.forRefresh(issued);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestBody Dtos.LogoutRequest body) {
        refreshTokens.revokeFamilyOf(body.refreshToken());
        return ResponseEntity.noContent().build();
    }
}
