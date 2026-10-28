package in.foodapp.identity.api;

import in.foodapp.identity.service.CredentialService;
import in.foodapp.identity.service.FeatureFlagService;
import in.foodapp.identity.service.OtpService;
import in.foodapp.identity.service.PhoneNormalizer;
import in.foodapp.identity.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/me")
public class MeController {

    private final UserService users;
    private final CredentialService credentials;
    private final OtpService otp;
    private final PhoneNormalizer phones;
    private final FeatureFlagService flags;

    public MeController(UserService users, CredentialService credentials, OtpService otp, PhoneNormalizer phones,
                        FeatureFlagService flags) {
        this.users = users;
        this.credentials = credentials;
        this.otp = otp;
        this.phones = phones;
        this.flags = flags;
    }

    @GetMapping
    public Dtos.MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return users.me(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/credentials")
    public ResponseEntity<Void> addCredentials(@AuthenticationPrincipal Jwt jwt,
                                               @Valid @RequestBody Dtos.CredentialsRequest body) {
        credentials.addCredentials(UUID.fromString(jwt.getSubject()), body);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/phone/request")
    public ResponseEntity<Dtos.Accepted> requestPhoneOtp(@Valid @RequestBody Dtos.PhoneRequest body,
                                                         HttpServletRequest request) {
        otp.request(body.phone(), request.getRemoteAddr(), body.captchaToken());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new Dtos.Accepted("If the number is valid, an OTP has been sent"));
    }

    @PostMapping("/phone/verify")
    public ResponseEntity<Void> verifyPhone(@AuthenticationPrincipal Jwt jwt,
                                            @Valid @RequestBody Dtos.PhoneVerifyRequest body) {
        String phone = phones.normalise(body.phone());
        UUID challenge = otp.check(phone, body.code())
                .orElseThrow(() -> ApiException.unauthorized("Invalid or expired code"));
        users.addPhone(UUID.fromString(jwt.getSubject()), phone, challenge);
        return ResponseEntity.noContent().build();
    }

    /** Self-service partner sign-up; the client then refreshes its token to receive the PARTNER role. */
    @PostMapping("/partner")
    public ResponseEntity<Void> becomePartner(@AuthenticationPrincipal Jwt jwt) {
        flags.require("delivery_module", "Delivery partner sign-up");
        users.enrollPartner(UUID.fromString(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/consents")
    public ResponseEntity<Void> consent(@AuthenticationPrincipal Jwt jwt,
                                        @Valid @RequestBody Dtos.ConsentInput body,
                                        HttpServletRequest request) {
        users.recordConsent(UUID.fromString(jwt.getSubject()), body, request.getRemoteAddr());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt) {
        users.delete(UUID.fromString(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }
}
