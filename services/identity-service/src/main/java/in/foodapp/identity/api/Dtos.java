package in.foodapp.identity.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class Dtos {

    private Dtos() {
    }

    public record OtpRequest(@NotBlank String phone, String captchaToken) {
    }

    public record ConsentInput(@NotBlank @Size(max = 100) String purpose,
                               @NotBlank @Size(max = 50) String version,
                               boolean granted) {
    }

    public record OtpVerifyRequest(@NotBlank String phone,
                                   @NotBlank @Size(max = 10) String code,
                                   @Valid ConsentInput consent,
                                   @Size(max = 80) String name) {
    }

    public record RegisterRequest(@NotBlank @Size(max = 80) String name,
                                  @NotBlank @Size(max = 254) String email,
                                  @NotBlank @Size(max = 128) String password,
                                  @Valid ConsentInput consent) {
    }

    public record LoginRequest(@NotBlank @Size(max = 254) String email,
                               @NotBlank @Size(max = 128) String password) {
    }

    public record CredentialsRequest(@NotBlank @Size(max = 254) String email,
                                     @NotBlank @Size(max = 128) String password) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record TokenRequest(@NotBlank @Size(max = 100) String token, @NotBlank @Size(max = 200) String password) {
    }

    public record EmailRequest(@NotBlank @Size(max = 254) String email) {
    }

    public record ResetPasswordRequest(@NotBlank @Size(max = 100) String token,
                                       @NotBlank @Size(max = 128) String password) {
    }

    public record PhoneRequest(@NotBlank String phone, String captchaToken) {
    }

    public record PhoneVerifyRequest(@NotBlank String phone, @NotBlank @Size(max = 10) String code) {
    }

    public record LogoutRequest(String refreshToken) {
    }

    public record TokenResponse(String accessToken, String refreshToken, long expiresIn) {
    }

    public record MeResponse(UUID id, String name, String phone, String email, boolean emailVerified,
                             boolean hasPassword, List<String> roles, String status, Instant createdAt) {
    }

    public record Accepted(String message) {
    }

    /** Either tokens (signed in) or a challengeId (an emailed code is still needed). */
    public record AdminLoginResponse(TokenResponse tokens, UUID challengeId) {
    }

    public record AdminCodeRequest(@jakarta.validation.constraints.NotNull UUID challengeId,
                                   @NotBlank @Size(max = 10) String code) {
    }

    public record AcceptInviteRequest(@NotBlank @Size(max = 100) String token,
                                      @NotBlank @Size(max = 254) String email,
                                      @NotBlank @Size(max = 128) String password) {
    }

    public record InviteRequest(@NotBlank @jakarta.validation.constraints.Email @Size(max = 254) String email) {
    }

    public record TeamMember(UUID userId, String name, String email, boolean main) {
    }

    public record TeamInvite(UUID id, String email, Instant expiresAt) {
    }

    public record TeamView(List<TeamMember> members, List<TeamInvite> invites) {
    }
}
